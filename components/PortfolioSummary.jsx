"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { stagger } from "@/lib/motion";
import { xirr, formatMoney, formatPercent } from "@/lib/calculateUtils";

/**
 * Portfolio-level totals. XIRR is the headline rather than an average of the
 * per-row CAGRs: annualised rates over different holding periods are not
 * additive, so averaging them describes nothing real.
 */
const PortfolioSummary = ({ rows }) => {
  const reduceMotion = useReducedMotion();
  const summary = useMemo(() => {
    const priced = rows.filter((r) => r.status === "priced");
    if (!priced.length) return null;

    const invested = priced.reduce((sum, r) => sum + Number(r.amount), 0);
    const currentValue = priced.reduce((sum, r) => sum + r.currentValue, 0);

    // Each purchase is money out; today's total holding value is money back in.
    const flows = priced.map((r) => ({ date: r.date, amount: -Number(r.amount) }));
    flows.push({ date: new Date(), amount: currentValue });

    return {
      count: priced.length,
      invested,
      currentValue,
      gain: currentValue - invested,
      absoluteReturn: invested > 0 ? ((currentValue - invested) / invested) * 100 : null,
      xirr: xirr(flows),
    };
  }, [rows]);

  if (!summary) return null;

  const tone =
    summary.gain > 0 ? "text-green-700" : summary.gain < 0 ? "text-red-600" : "";
  const sign = summary.gain > 0 ? "+" : "";

  const stats = [
    { label: "Invested", value: formatMoney(summary.invested) },
    { label: "Current value", value: formatMoney(summary.currentValue) },
    {
      label: "Gain",
      value: `${sign}${formatMoney(summary.gain)}`,
      tone,
    },
    {
      label: "Absolute return",
      value: `${sign}${formatPercent(summary.absoluteReturn)}`,
      tone,
    },
    {
      label: "XIRR",
      value: summary.xirr === null ? "-" : formatPercent(summary.xirr),
      tone: summary.xirr > 0 ? "text-green-700" : summary.xirr < 0 ? "text-red-600" : "",
      hint: "Money-weighted annual return across all purchase dates",
    },
  ];

  return (
    <section
      aria-label="Portfolio summary"
      className="grid grid-cols-2 md:grid-cols-5 gap-px bg-gray-200 border border-gray-200"
    >
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : stagger(index, 0.04, 0.2)}
          className="bg-white px-4 py-3"
          title={stat.hint}
        >
          <div className="text-[11px] uppercase tracking-wider text-gray-500">
            {stat.label}
          </div>
          <div className={`text-lg font-semibold tabular-nums ${stat.tone ?? ""}`}>
            {stat.value}
          </div>
        </motion.div>
      ))}
      <p className="col-span-2 md:col-span-5 bg-white px-4 py-2 text-[11px] text-gray-500">
        Based on {summary.count} priced {summary.count === 1 ? "row" : "rows"}.
        Rows that could not be priced are excluded entirely rather than counted
        as zero.
      </p>
    </section>
  );
};

export default PortfolioSummary;
