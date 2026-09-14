import { getTerSnapshot, lookupTer } from "@/lib/ter";
import { MAX_SCHEMES_PER_REQUEST } from "@/lib/amfi";
import { rateLimit, clientKey, RATE_LIMIT } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const json = (body, init = {}) =>
  Response.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...init.headers },
  });

/**
 * Expense ratios for the requested schemes.
 *
 * Deliberately separate from /api/nav: TER is enrichment, and a slow or failed
 * TER fetch must never delay or break pricing. This route degrades to
 * `available: false` rather than erroring.
 */
export async function GET(request) {
  const limit = rateLimit(`ter:${clientKey(request)}`);
  if (!limit.allowed) {
    return json({ error: "Too many requests, please slow down" }, {
      status: 429,
      headers: { "RateLimit-Limit": String(RATE_LIMIT), "RateLimit-Remaining": "0" },
    });
  }

  const raw = request.nextUrl.searchParams.get("schemes");
  if (!raw) return json({ status: false, error: "No schemes provided" }, { status: 400 });

  const requested = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!requested.length || requested.length > MAX_SCHEMES_PER_REQUEST) {
    return json(
      { status: false, error: `Provide between 1 and ${MAX_SCHEMES_PER_REQUEST} schemes` },
      { status: 400 }
    );
  }

  const index = await getTerSnapshot();
  if (!index) {
    // Not an error: the column simply has nothing to show.
    return json({ status: true, available: false, terDate: null, data: [] });
  }

  return json({
    status: true,
    available: true,
    terDate: index.terDate,
    schemeCount: index.schemeCount,
    attribution: {
      source: "AMFI (Association of Mutual Funds in India)",
      note: "TER is already deducted from NAV. Shown for transparency, not applied to any return.",
    },
    data: requested.map((entry) => {
      // "name|plan", so one request covers both plans of the same fund.
      const [scheme, plan] = entry.split("|");
      const hit = lookupTer(index, scheme, plan);
      return { scheme: entry, ter: hit?.ter ?? null, regular: hit?.regular ?? null, direct: hit?.direct ?? null };
    }),
  });
}
