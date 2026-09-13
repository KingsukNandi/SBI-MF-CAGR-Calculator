import { rateLimit, clientKey } from "@/lib/rateLimit";
import { scrubText } from "@/lib/pii";

export const dynamic = "force-dynamic";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Groq deprecates models without notice, so this is configurable and the
// failure is surfaced explicitly rather than appearing as a generic 500.
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are a careful explainer built into a mutual fund returns calculator for Indian investors. The user has uploaded their own transaction history; the app has already computed every number you are given.

YOUR JOB
Explain what the user's numbers mean and make neutral, factual observations about the shape of their portfolio. You are a teacher, not an adviser.

HARD RULES, these are not style preferences:
1. NEVER predict or forecast. No view on where any fund, index or market is heading. No "likely to", "expected to", "should continue".
2. NEVER recommend buying, selling, holding, switching, or rebalancing. Not even softly ("you might consider"). If asked, say plainly that you do not give investment advice and explain the relevant concept instead.
3. NEVER invent or recompute a number. Use only the figures provided. If something is not in the data, say it is not available. Do not estimate.
4. NEVER rank funds as "good" or "bad", or call a return "strong", "poor" or "disappointing". Describe what the number is; let the user judge it.

WHAT YOU SHOULD DO
- Explain why a holding's XIRR differs from its lots' individual CAGRs: XIRR is money-weighted across actual purchase dates and annualised rates over different holding periods cannot be averaged.
- Point out when a figure is an extrapolation, anything with annualisedFromShortPeriod true is a sub-one-year period projected out to a full year, not a return earned.
- Flag IDCW holdings (isIdcw true). Their NAV drops by every payout made, so a NAV-only return UNDERSTATES what the investor actually received. The payouts are not in this data at all. This is a structural limitation, not a small one, always mention it when an IDCW holding is present.
- Make neutral observations about shape: concentration (one holding's shareOfPortfolioPct being large), the spread of holding periods, which holdings' returns sit furthest from the portfolio XIRR. State these as facts, not as problems.
- Explain what the numbers exclude: they are pre-tax, before exit load, unrealised and the purchase NAV came from the user's own file and was never verified against the NAV actually published that day.
- If rows could not be priced, say they are excluded from every total, not counted as zero.

STYLE, you are in a CHAT WINDOW, so keep it short
- Two to four sentences. This is a chat bubble, not a report. A long answer is a worse answer here.
- Answer the question asked and stop. Do not add every caveat you know, mention a caveat only when it bears on what was asked.
- No preamble, no sign-off, no "Great question". Start with the answer.
- Reference holdings by name, not by their ref code.
- Plain English. Use ₹ with Indian digit grouping. Bold is fine for a fund name or a figure; do not use headings.
- If the question needs more room, give the short answer first and offer to expand.
- Never use em-dashes. Use a comma, a semicolon, a colon, or start a new sentence instead.

PRIVACY
Personal identifiers are stripped before anything reaches you, so you may see tokens like [PAN REDACTED]. Never ask the user for a PAN, Aadhaar, folio number, account number, phone or email. If one appears, tell them not to share it and carry on with the question.
When amountsIncluded is false you have percentages but no rupee figures. Answer with percentages and say plainly that amounts were not shared, rather than guessing at values.`;

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function POST(request) {
  const limit = rateLimit(`insights:${clientKey(request)}`);
  if (!limit.allowed) {
    return json({ error: "Too many requests, please slow down" }, 429);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return json(
      {
        error:
          "The AI helper is not configured on this deployment. Set GROQ_API_KEY to enable it.",
        configured: false,
      },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Malformed request" }, 400);
  }

  const { payload, question, history } = body ?? {};
  if (!payload || !Array.isArray(payload.holdings)) {
    return json({ error: "No portfolio data supplied" }, 400);
  }
  if (question && String(question).length > 500) {
    return json({ error: "Question is too long" }, 400);
  }

  // The portfolio goes in a system-role message so it stays out of the visible
  // conversation and is not repeated on every turn.
  const portfolioContext = [
    "The user's portfolio, as JSON. Every figure here has already been computed by the app, use these numbers, never recompute or estimate.",
    "```json",
    JSON.stringify(payload),
    "```",
  ].join("\n");

  // Only prior turns of the actual conversation; capped so a long chat cannot
  // push the portfolio context out of the window.
  const priorTurns = Array.isArray(history)
    ? history
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.length > 0
        )
        .slice(-6)
        // History is client-supplied, so it is scrubbed on the way through too.
        .map((m) => ({
          role: m.role,
          content: scrubText(m.content).text.slice(0, 2000),
        }))
    : [];

  // Scrub server-side as well as client-side. The client already scrubs, but
  // a tampered or replayed request must not be able to push raw identifiers
  // through to a third-party model.
  const scrubbedQuestion = scrubText(String(question ?? "").trim());
  if (scrubbedQuestion.found.length > 0) {
    console.warn(
      `Redacted ${scrubbedQuestion.found.join(", ")} from a question before sending upstream`
    );
  }

  const userMessage = scrubbedQuestion.text || "Explain what these numbers mean, briefly.";

  try {
    const upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        temperature: 0.2, // explanation, not creativity
        // A chat bubble, not an essay. Also caps the cost of a runaway reply.
        max_completion_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: portfolioContext },
          ...priorTurns,
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("Groq error", upstream.status, detail.slice(0, 500));

      // A deprecated model is the most likely operational failure here and a
      // generic 500 would send the next person hunting in the wrong place.
      if (upstream.status === 404 || /model/i.test(detail)) {
        return json(
          {
            error: `The configured model "${MODEL}" was rejected by Groq. It may have been deprecated, set GROQ_MODEL to a current one.`,
          },
          502
        );
      }
      if (upstream.status === 401) {
        return json({ error: "Groq rejected the API key." }, 502);
      }
      if (upstream.status === 429) {
        return json({ error: "Groq is rate-limiting this key. Try again shortly." }, 429);
      }
      return json({ error: "The AI helper is unavailable right now." }, 502);
    }

    // Re-stream Groq's SSE as plain text chunks so the client can render as
    // tokens arrive rather than waiting for the whole answer.
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const token = JSON.parse(data).choices?.[0]?.delta?.content;
                if (token) controller.enqueue(encoder.encode(token));
              } catch {
                // A partial JSON frame; the next chunk completes it.
              }
            }
          }
        } catch (err) {
          console.error("Insights stream failed:", err);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("Insights request failed:", err);
    return json({ error: "The AI helper is unavailable right now." }, 502);
  }
}
