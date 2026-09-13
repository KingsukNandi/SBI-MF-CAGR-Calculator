"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  formatMoney,
  formatPercent,
  formatUnits,
} from "@/lib/calculateUtils";
import {
  sortItems,
  nextSortConfig,
  ariaSortFor,
  sortIndicator,
} from "@/lib/sorting";

const tone = (v) => (v > 0 ? "text-green-700" : v < 0 ? "text-red-600" : "");
const sign = (v) => (v > 0 ? "+" : "");

const COLUMNS = [
  { key: "scheme", label: "Holding", align: "text-left" },
  { key: "lotCount", label: "Lots", align: "text-right" },
  { key: "units", label: "Units", align: "text-right" },
  { key: "averageNAV", label: "Avg cost", align: "text-right" },
  { key: "currentNAV", label: "NAV", align: "text-right" },
  { key: "invested", label: "Invested", align: "text-right" },
  { key: "currentValue", label: "Value", align: "text-right" },
  { key: "absoluteGain", label: "Gain", align: "text-right" },
  { key: "absoluteReturn", label: "Return", align: "text-right" },
  { key: "xirr", label: "XIRR", align: "text-right" },
];

const HOLDING_ACCESSORS = {
  scheme: (h) => h.matchedScheme || h.schemeName,
  currentNAV: (h) => Number.parseFloat(h.currentNAV),
};

const LOT_COLUMNS = [
  { key: "date", label: "Purchase date", align: "text-left" },
  { key: "amount", label: "Amount", align: "text-right" },
  { key: "purchaseNAV", label: "NAV", align: "text-right" },
  { key: "units", label: "Units", align: "text-right" },
  { key: "currentValue", label: "Value", align: "text-right" },
  { key: "absoluteGain", label: "Gain", align: "text-right" },
  { key: "absoluteReturn", label: "Return", align: "text-right" },
  { key: "cagr", label: "CAGR", align: "text-right" },
];

const LOT_ACCESSORS = {
  amount: (l) => Number.parseFloat(l.amount),
  purchaseNAV: (l) => Number.parseFloat(l.purchaseNAV),
};

/** A sortable header cell, shared by both tables. */
const SortableHeader = ({ column, config, onSort, dark = true }) => (
  <th
    scope="col"
    aria-sort={ariaSortFor(config, column.key)}
    className={`p-0 ${column.align}`}
  >
    <button
      type="button"
      onClick={() => onSort(column.key)}
      className={`w-full px-3 py-2 whitespace-nowrap cursor-pointer transition-colors duration-150 ${column.align} ${
        dark
          ? "hover:bg-[#0095c7] focus-visible:outline-2 focus-visible:outline-white font-semibold"
          : "hover:bg-gray-200/70 focus-visible:outline-2 focus-visible:outline-[#00b5ef] font-normal text-[11px] uppercase tracking-wider text-gray-500"
      }`}
    >
      {column.label}
      <span className="inline-block w-3">{sortIndicator(config, column.key)}</span>
    </button>
  </th>
);

/** Lots of one holding, with their own independent sort. */
const LotTable = ({ lots }) => {
  const [config, setConfig] = useState({ key: "date", direction: "asc" });
  const sorted = useMemo(
    () => sortItems(lots, config, LOT_ACCESSORS),
    [lots, config]
  );

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr>
            {LOT_COLUMNS.map((c) => (
              <SortableHeader
                key={c.key}
                column={c}
                config={config}
                dark={false}
                onSort={(key) => setConfig((cur) => nextSortConfig(cur, key))}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => {
            const priced = l.status === "priced";
            return (
              <tr key={l.id} className="tabular-nums hover:bg-white/60 transition-colors">
                <td className="text-left px-3 py-1">{l.rawDate || "-"}</td>
                <td className="text-right px-3">{formatMoney(Number(l.amount))}</td>
                <td className="text-right px-3">{l.purchaseNAV}</td>
                <td className="text-right px-3">
                  {priced ? formatUnits(l.units) : "-"}
                </td>
                <td className="text-right px-3">
                  {priced ? formatMoney(l.currentValue) : "-"}
                </td>
                <td className={`text-right px-3 ${priced ? tone(l.absoluteGain) : ""}`}>
                  {priced ? `${sign(l.absoluteGain)}${formatMoney(l.absoluteGain)}` : "-"}
                </td>
                <td className={`text-right px-3 ${priced ? tone(l.absoluteReturn) : ""}`}>
                  {priced
                    ? `${sign(l.absoluteReturn)}${formatPercent(l.absoluteReturn)}`
                    : "-"}
                </td>
                <td className="text-right px-3">
                  {!priced ? (
                    <span className="text-red-600 text-xs">{l.reason}</span>
                  ) : l.cagr === null ? (
                    "-"
                  ) : (
                    <span
                      className={
                        l.annualisedFromShortPeriod ? "text-gray-500" : tone(l.cagr)
                      }
                      title={
                        l.annualisedFromShortPeriod
                          ? `Held ${l.holdingDays} days. This projects that period out to a full year.`
                          : undefined
                      }
                    >
                      {sign(l.cagr)}
                      {formatPercent(l.cagr)}
                      {l.annualisedFromShortPeriod && (
                        <span className="text-[10px] text-gray-400 ml-1">
                          ({l.holdingDays}d)
                        </span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-500 mt-2 px-3">
        The holding&apos;s XIRR is computed from these purchase dates and amounts
        together. It is <strong>not</strong> the average of the per-lot CAGRs,
        because annualised rates over different holding periods cannot be
        averaged.
      </p>
    </>
  );
};

/**
 * One row per holding (folio plus scheme) rather than per transaction.
 * The return shown is XIRR over the holding's own cashflows.
 */
const HoldingsTable = ({ holdings }) => {
  const [expanded, setExpanded] = useState(() => new Set());
  const [config, setConfig] = useState({ key: "", direction: "" });
  const reduceMotion = useReducedMotion();

  const sorted = useMemo(
    () => sortItems(holdings, config, HOLDING_ACCESSORS),
    [holdings, config]
  );

  const toggle = (key) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="overflow-auto w-full max-h-[calc(100vh-6rem)] border border-gray-200 rounded-lg">
      <table className="table w-max min-w-full bg-white whitespace-nowrap">
        <thead className="sticky top-0 z-10 bg-[#00b5ef] text-white">
          <tr>
            {COLUMNS.map((c) => (
              <SortableHeader
                key={c.key}
                column={c}
                config={config}
                onSort={(key) => setConfig((cur) => nextSortConfig(cur, key))}
              />
            ))}
          </tr>
        </thead>
        <tbody className="text-black">
          {sorted.map((h) => {
            const open = expanded.has(h.key);
            const priced = h.status === "priced";

            return [
              <tr
                key={h.key}
                className={`transition-colors ${
                  priced ? "hover:bg-gray-50" : "bg-red-50/40"
                }`}
              >
                <td className="px-3 py-2 text-left">
                  <button
                    type="button"
                    onClick={() => toggle(h.key)}
                    aria-expanded={open}
                    className="text-left hover:underline focus-visible:outline-2 focus-visible:outline-[#00b5ef] rounded"
                  >
                    <motion.span
                      className="text-gray-400 mr-1 inline-block"
                      animate={{ rotate: open ? 90 : 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.18 }}
                    >
                      ▸
                    </motion.span>
                    {h.matchedScheme || h.schemeName}
                    <span className="block text-[11px] text-gray-500 ml-4">
                      Folio {h.folioNo || "not given"}
                      {h.navDate ? ` · NAV ${h.navDate}` : ""}
                    </span>
                  </button>
                </td>

                <td className="px-3 py-2 text-right tabular-nums">
                  {h.lotCount}
                  {h.unpricedCount > 0 && (
                    <span
                      className="text-[11px] text-red-600 ml-1"
                      title={`${h.unpricedCount} lot(s) could not be priced and are excluded from every figure in this row`}
                    >
                      ({h.unpricedCount}✗)
                    </span>
                  )}
                </td>

                {!priced ? (
                  <td
                    className="px-3 py-2 text-gray-500 text-sm"
                    colSpan={COLUMNS.length - 2}
                  >
                    {h.reason}
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">{formatUnits(h.units)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" title="Weighted average cost per unit">
                      {h.averageNAV ? h.averageNAV.toFixed(4) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.currentNAV || "-"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(h.invested)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatMoney(h.currentValue)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(h.absoluteGain)}`}>
                      {sign(h.absoluteGain)}
                      {formatMoney(h.absoluteGain)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(h.absoluteReturn)}`}>
                      {sign(h.absoluteReturn)}
                      {formatPercent(h.absoluteReturn)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        h.xirrFromShortPeriod ? "text-gray-500" : tone(h.xirr)
                      }`}
                      title={
                        h.xirrFromShortPeriod
                          ? `Held ${h.holdingDays} days. Annualising a period this short projects it out as if it repeated all year, so it is not a return you have earned.`
                          : `${h.lotCount} purchase${h.lotCount === 1 ? "" : "s"} since ${h.firstPurchase?.toISOString().slice(0, 10)}`
                      }
                    >
                      {h.xirr === null ? (
                        "-"
                      ) : (
                        <>
                          {sign(h.xirr)}
                          {formatPercent(h.xirr)}
                          {h.xirrFromShortPeriod && (
                            <span className="text-[10px] text-gray-400 ml-1">
                              ({h.holdingDays}d)
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </>
                )}
              </tr>,

              <AnimatePresence key={`${h.key}-lots`} initial={false}>
                {open && (
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.15 }}
                    className="bg-gray-50/60"
                  >
                    <td colSpan={COLUMNS.length} className="p-0">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="py-2">
                          <LotTable lots={h.lots} />
                        </div>
                      </motion.div>
                    </td>
                  </motion.tr>
                )}
              </AnimatePresence>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
};

export default HoldingsTable;
