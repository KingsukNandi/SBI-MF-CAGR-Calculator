"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { formatMoney, formatPercent, formatUnits } from "@/lib/calculateUtils";
import { sortItems, nextSortConfig } from "@/lib/sorting";
import { useColumnOrder } from "@/lib/useColumnOrder";
import ColumnHeader from "./ColumnHeader";
import ResetColumnsButton from "./ResetColumnsButton";
import ColumnPicker from "./ColumnPicker";

const tone = (v) => (v > 0 ? "text-green-700" : v < 0 ? "text-red-600" : "");
const sign = (v) => (v > 0 ? "+" : "");

const COLUMNS = [
  { key: "scheme", label: "Holding", align: "text-left" },
  { key: "lotCount", label: "Lots", align: "text-right" },
  { key: "units", label: "Units", align: "text-right" },
  { key: "averageNAV", label: "Avg cost", align: "text-right" },
  { key: "currentNAV", label: "Current NAV", align: "text-right" },
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
  { key: "purchaseNAV", label: "Purchase NAV", align: "text-right" },
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

/** One lot's cell for a given column. Keyed by column so order can change. */
const lotCell = (key, l) => {
  const priced = l.status === "priced";
  switch (key) {
    case "date":
      return l.rawDate || "-";
    case "amount":
      return formatMoney(Number(l.amount));
    case "purchaseNAV":
      return l.purchaseNAV;
    case "units":
      return priced ? formatUnits(l.units) : "-";
    case "currentValue":
      return priced ? formatMoney(l.currentValue) : "-";
    case "absoluteGain":
      return priced ? (
        <span className={tone(l.absoluteGain)}>
          {sign(l.absoluteGain)}
          {formatMoney(l.absoluteGain)}
        </span>
      ) : (
        "-"
      );
    case "absoluteReturn":
      return priced ? (
        <span className={tone(l.absoluteReturn)}>
          {sign(l.absoluteReturn)}
          {formatPercent(l.absoluteReturn)}
        </span>
      ) : (
        "-"
      );
    case "cagr":
      if (!priced) return <span className="text-red-600 text-xs">{l.reason}</span>;
      if (l.cagr === null) return "-";
      return (
        <span
          className={l.annualisedFromShortPeriod ? "text-gray-500" : tone(l.cagr)}
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
      );
    default:
      return "-";
  }
};

/**
 * Lots of one holding. Column order is owned by the parent so every expanded
 * lot table shares one layout: reordering inside one would otherwise leave its
 * already-open siblings on the old order.
 */
const LotTable = ({ lots, order }) => {
  const [config, setConfig] = useState({ key: "date", direction: "asc" });
  const sorted = useMemo(() => sortItems(lots, config, LOT_ACCESSORS), [lots, config]);

  return (
    <>
      <table className="w-max min-w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="group/head">
            {order.columns.map((c, i) => (
              <ColumnHeader
                key={c.key}
                column={c}
                index={i}
                total={order.columns.length}
                sortConfig={config}
                onSort={(key) => setConfig((cur) => nextSortConfig(cur, key))}
                dragIndex={order.dragIndex}
                overIndex={order.overIndex}
                handlers={order.handlers}
                onNudge={order.nudge}
                onResize={order.resize}
                width={order.widths[c.key]}
                dark={false}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => (
            <tr key={l.id} className="tabular-nums hover:bg-white/60 transition-colors">
              {order.columns.map((c) => (
                <td
                  key={c.key}
                  style={order.widths[c.key] ? { maxWidth: order.widths[c.key] } : undefined}
                  className={`${c.align} px-3 py-1 overflow-hidden text-ellipsis`}
                >
                  {lotCell(c.key, l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-500 mt-2 px-3 whitespace-normal">
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

  const order = useColumnOrder("holdings", COLUMNS);
  const lotOrder = useColumnOrder("lots", LOT_COLUMNS);

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

  /** One holding's cell for a given column. */
  const holdingCell = (key, h, open) => {
    const priced = h.status === "priced";

    if (key === "scheme") {
      return (
        <button
          type="button"
          onClick={() => toggle(h.key)}
          aria-expanded={open}
          className="text-left max-w-full block overflow-hidden text-ellipsis hover:underline focus-visible:outline-2 focus-visible:outline-[#00b5ef] rounded"
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
            {!priced && <span className="text-red-600"> · {h.reason}</span>}
          </span>
        </button>
      );
    }

    if (key === "lotCount") {
      return (
        <>
          {h.lotCount}
          {h.unpricedCount > 0 && (
            <span
              className="text-[11px] text-red-600 ml-1"
              title={`${h.unpricedCount} lot(s) could not be priced and are excluded from every figure in this row`}
            >
              ({h.unpricedCount}✗)
            </span>
          )}
        </>
      );
    }

    // Every remaining column is a number that only exists once priced.
    if (!priced) return "-";

    switch (key) {
      case "units":
        return formatUnits(h.units);
      case "averageNAV":
        return h.averageNAV ? h.averageNAV.toFixed(4) : "-";
      case "currentNAV":
        return h.currentNAV || "-";
      case "invested":
        return formatMoney(h.invested);
      case "currentValue":
        return <span className="font-medium">{formatMoney(h.currentValue)}</span>;
      case "absoluteGain":
        return (
          <span className={tone(h.absoluteGain)}>
            {sign(h.absoluteGain)}
            {formatMoney(h.absoluteGain)}
          </span>
        );
      case "absoluteReturn":
        return (
          <span className={tone(h.absoluteReturn)}>
            {sign(h.absoluteReturn)}
            {formatPercent(h.absoluteReturn)}
          </span>
        );
      case "xirr":
        if (h.xirr === null) return "-";
        return (
          <span
            className={h.xirrFromShortPeriod ? "text-gray-500" : tone(h.xirr)}
            title={
              h.xirrFromShortPeriod
                ? `Held ${h.holdingDays} days. Annualising a period this short projects it out as if it repeated all year, so it is not a return you have earned.`
                : `${h.lotCount} purchase${h.lotCount === 1 ? "" : "s"} since ${h.firstPurchase?.toISOString().slice(0, 10)}`
            }
          >
            {sign(h.xirr)}
            {formatPercent(h.xirr)}
            {h.xirrFromShortPeriod && (
              <span className="text-[10px] text-gray-400 ml-1">
                ({h.holdingDays}d)
              </span>
            )}
          </span>
        );
      default:
        return "-";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ColumnPicker label="Holding columns" order={order} />
        <ColumnPicker label="Lot columns" order={lotOrder} />
      </div>

      <ResetColumnsButton
        orders={[
          { label: "holdings", order },
          { label: "lot", order: lotOrder },
        ]}
      />

      <div className="overflow-auto w-full max-h-[calc(100vh-6rem)] border border-gray-200 rounded-lg">
        <table className="table w-max min-w-full bg-white whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-[#00b5ef] text-white">
            <tr className="group/head">
              {order.columns.map((c, i) => (
                <ColumnHeader
                  key={c.key}
                  column={c}
                  index={i}
                  total={order.columns.length}
                  sortConfig={config}
                  onSort={(key) => setConfig((cur) => nextSortConfig(cur, key))}
                  dragIndex={order.dragIndex}
                  overIndex={order.overIndex}
                  handlers={order.handlers}
                  onNudge={order.nudge}
                  onResize={order.resize}
                  width={order.widths[c.key]}
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
                  {order.columns.map((c) => (
                    <td
                      key={c.key}
                      style={
                        order.widths[c.key]
                          ? { maxWidth: order.widths[c.key] }
                          : undefined
                      }
                      className={`px-3 py-2 tabular-nums overflow-hidden text-ellipsis ${c.align}`}
                    >
                      {holdingCell(c.key, h, open)}
                    </td>
                  ))}
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
                      <td colSpan={order.columns.length} className="p-0">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          transition={{
                            duration: reduceMotion ? 0 : 0.22,
                            ease: "easeOut",
                          }}
                          className="overflow-hidden"
                        >
                          <div className="py-2">
                            <LotTable lots={h.lots} order={lotOrder} />
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
    </div>
  );
};

export default HoldingsTable;
