"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { popover, bubble, tap, DURATION, EASE } from "@/lib/motion";
import Markdown from "./Markdown";
import { buildInsightsPayload, describePayload } from "@/lib/insightsPayload";
import { scrubText } from "@/lib/pii";

const SUGGESTIONS = [
  "Why is my XIRR different from the CAGRs?",
  "What do these numbers leave out?",
  "Which holdings sit furthest from my overall return?",
];

/**
 * Floating chat helper, bottom-right.
 *
 * Explains figures the app has already computed. It does not forecast or
 * recommend, the guardrails live in the system prompt in
 * app/api/insights/route.js, not here.
 */
const ChatWidget = ({ holdings, summary, navDate }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  // Rupee amounts are personal financial data, so they are withheld unless
  // the user turns them on.
  const [includeAmounts, setIncludeAmounts] = useState(false);
  const [redactedNotice, setRedactedNotice] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const reduceMotion = useReducedMotion();

  const payload = useMemo(
    () => buildInsightsPayload({ holdings, summary, navDate, includeAmounts }),
    [holdings, summary, navDate, includeAmounts]
  );
  const disclosure = useMemo(() => describePayload(payload), [payload]);

  // Keep the newest message in view as tokens stream in.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes, which is what people expect of a floating panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (rawText) => {
    const typed = rawText.trim();
    if (!typed || busy) return;

    // Scrub before anything leaves the browser. The server scrubs again, but
    // the right place to stop an identifier is before it is transmitted.
    const { text: question, found } = scrubText(typed);
    setRedactedNotice(
      found.length
        ? `Removed ${found.join(", ")} from your message before sending.`
        : ""
    );

    setInput("");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Prior turns give the model context; only the last few are sent, because
    // the portfolio payload already dominates the prompt.
    const history = messages
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));

    setMessages((m) => [
      ...m,
      { role: "user", content: question },
      { role: "assistant", content: "", pending: true },
    ]);
    setBusy(true);

    try {
      const response = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ payload, question, history }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        setMessages((m) =>
          m.map((msg, i) =>
            i === m.length - 1
              ? {
                  role: "assistant",
                  content: detail.error || "I could not reach the helper.",
                  error: true,
                }
              : msg
          )
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((m) =>
          m.map((msg, i) =>
            i === m.length - 1
              ? { role: "assistant", content: accumulated, pending: true }
              : msg
          )
        );
      }

      setMessages((m) =>
        m.map((msg, i) =>
          i === m.length - 1
            ? { role: "assistant", content: accumulated, pending: false }
            : msg
        )
      );
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error(err);
      setMessages((m) =>
        m.map((msg, i) =>
          i === m.length - 1
            ? { role: "assistant", content: "I could not reach the helper.", error: true }
            : msg
        )
      );
    } finally {
      setBusy(false);
    }
  };

  if (!summary) return null;

  return (
    <>
      {/* Launcher */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close the helper" : "Open the helper"}
        whileTap={reduceMotion ? undefined : tap}
        whileHover={reduceMotion ? undefined : { scale: 1.05 }}
        transition={{ duration: DURATION.fast, ease: EASE }}
        className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-[#00b5ef] text-white shadow-lg hover:bg-[#0095c7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00b5ef] flex items-center justify-center text-3xl"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "close" : "open"}
            initial={{ opacity: 0, rotate: reduceMotion ? 0 : -90, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: reduceMotion ? 0 : 90, scale: 0.6 }}
            transition={{ duration: reduceMotion ? 0 : DURATION.fast, ease: EASE }}
          >
            {open ? "✕" : "✦"}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
        <motion.div
          role="dialog"
          aria-label="Portfolio helper"
          initial={reduceMotion ? { opacity: 0 } : popover.initial}
          animate={reduceMotion ? { opacity: 1 } : popover.animate}
          exit={reduceMotion ? { opacity: 0 } : popover.exit}
          transition={reduceMotion ? { duration: 0 } : popover.transition}
          style={{ originX: 1, originY: 1 }}
          className="fixed bottom-24 right-5 z-40 flex flex-col w-[min(24rem,calc(100vw-2.5rem))] h-[min(32rem,calc(100vh-9rem))] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
        >
          <header className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div>
              <p className="text-sm font-semibold text-gray-900">Portfolio helper</p>
              <p className="text-[11px] text-gray-500">
                Explains your numbers · not investment advice
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDisclosure((v) => !v)}
              aria-expanded={showDisclosure}
              className="text-[11px] text-[#00b5ef] hover:underline shrink-0"
            >
              What&apos;s sent?
            </button>
          </header>

          <AnimatePresence initial={false}>
          {showDisclosure && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : DURATION.fast, ease: EASE }}
              className="px-4 py-3 text-[11px] text-amber-900 bg-amber-50 border-b border-amber-200 space-y-1 shrink-0 overflow-hidden"
            >
              <p>
                Your figures go to Groq, an external service, only when you send
                a message.
              </p>
              <p>
                <strong>Sent:</strong> {disclosure.sent.join("; ")}.
              </p>
              <p>
                <strong>Not sent:</strong> {disclosure.notSent.join(", ")}.
              </p>
              <label className="flex items-start gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAmounts}
                  onChange={(e) => setIncludeAmounts(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Also send rupee amounts. Off by default: percentages answer
                  almost every question without revealing what your portfolio
                  is worth.
                </span>
              </label>
            </motion.div>
          )}
          </AnimatePresence>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : DURATION.base, ease: EASE }}
                className="space-y-3"
              >
                <p className="text-sm text-gray-600">
                  Ask me about the numbers on this page, what they mean, or what
                  they leave out. I explain; I don&apos;t predict or recommend.
                </p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <motion.button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      whileTap={reduceMotion ? undefined : tap}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-[#00b5ef]/40 text-[#0095c7] hover:bg-[#00b5ef]/10 transition-colors"
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {messages.map((m, i) => {
              const mine = m.role === "user";
              return (
                <motion.div
                  key={i}
                  initial={reduceMotion ? false : bubble(mine).initial}
                  animate={bubble(mine).animate}
                  transition={reduceMotion ? { duration: 0 } : bubble(mine).transition}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      mine
                        ? "bg-[#00b5ef] text-white rounded-br-sm"
                        : m.error
                          ? "bg-red-50 text-red-800 border border-red-200 rounded-bl-sm"
                          : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    {mine ? (
                      m.content
                    ) : m.content ? (
                      <Markdown>{m.content}</Markdown>
                    ) : (
                      <span className="flex gap-1 py-1" aria-label="Thinking">
                        {[0, 150, 300].map((d) => (
                          <span
                            key={d}
                            className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
                            style={{ animationDelay: `${d}ms` }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {redactedNotice && (
            <p
              role="status"
              className="px-3 py-2 text-[11px] text-amber-900 bg-amber-50 border-t border-amber-200 shrink-0"
            >
              {redactedNotice}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-gray-100 p-2.5 flex gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              maxLength={500}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your numbers…"
              aria-label="Message the helper"
              className="flex-1 min-w-0 rounded-full border border-gray-300 px-3.5 py-2 text-sm focus:outline-none focus:border-[#00b5ef]"
            />
            <motion.button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              whileTap={reduceMotion ? undefined : tap}
              className="shrink-0 h-9 w-9 rounded-full bg-[#00b5ef] text-white hover:bg-[#0095c7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              ↑
            </motion.button>
          </form>
        </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatWidget;
