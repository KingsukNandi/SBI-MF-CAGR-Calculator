"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import TableFilters from "./TableFilters";
import HoldingsTable from "./HoldingsTable";
import ChatWidget from "./ChatWidget";
import { pageTransition, viewTransition, tap, DURATION, EASE } from "@/lib/motion";
import { useColumnOrder } from "@/lib/useColumnOrder";
import ColumnHeader from "./ColumnHeader";
import ResetColumnsButton from "./ResetColumnsButton";
import PortfolioSummary from "./PortfolioSummary";
import { groupHoldings, summariseHoldings } from "@/lib/grouping";
import {
  loadRows,
  subscribeToRows,
  getServerRowsSnapshot,
} from "@/lib/csvSession";
import {
  computeRow,
  parseRowDate,
  detectDateOrder,
  formatDateInput,
  formatMoney,
  formatPercent,
  formatUnits,
} from "@/lib/calculateUtils";

const COLUMNS = [
  { key: "folioNo", label: "Folio No", align: "left" },
  { key: "schemeName", label: "Scheme", align: "left" },
  { key: "type", label: "Type", align: "left" },
  { key: "date", label: "Date", align: "center", editable: "date" },
  { key: "amount", label: "Amount", align: "right", editable: "number" },
  { key: "purchaseNAV", label: "Purchase NAV", align: "right", editable: "number" },
  { key: "currentNAV", label: "NAV", align: "right", editable: "number" },
  { key: "units", label: "Units", align: "right" },
  { key: "currentValue", label: "Value", align: "right" },
  { key: "absoluteGain", label: "Gain", align: "right" },
  { key: "absoluteReturn", label: "Return", align: "right" },
  { key: "cagr", label: "CAGR", align: "right" },
];

// Tolerate the header spellings people actually have in their CSVs.
const pick = (row, ...names) => {
  for (const name of names) {
    const key = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === name.toLowerCase()
    );
    if (key && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
};

const buildRows = (raw, order) =>
  raw.map((row, index) => {
    const rawDate = String(pick(row, "Date", "TransactionDate") || "").trim();
    return {
      id: `row-${index}`,
      folioNo: String(pick(row, "FolioNo", "Folio No", "Folio") || "").trim(),
      schemeName: String(pick(row, "SchemeName", "Scheme Name", "Scheme") || "").trim(),
      type: String(pick(row, "Type", "TransactionType") || "").trim(),
      rawDate,
      date: parseRowDate(rawDate, order),
      amount: String(pick(row, "Amount", "Value") || "").trim(),
      purchaseNAV: String(pick(row, "NAV", "PurchaseNAV", "Purchase NAV") || "").trim(),
      currentNAV: "",
      navDate: null,
      matchedScheme: null,
      lookup: "pending",
    };
  });

// One calculation path. Both the initial load and every edit come through here,
// so a row's numbers can never depend on whether it has been touched.
const priceRow = (row) => {
  if (!row.date) {
    return { ...row, status: "unpriced", reason: `Unreadable date "${row.rawDate}"` };
  }
  const result = computeRow({
    amount: row.amount,
    startNAV: row.purchaseNAV,
    endNAV: row.currentNAV,
    purchaseDate: row.date,
  });
  return { ...row, ...result };
};

const STATUS_LABEL = {
  notFound: "Not found in AMFI",
  ambiguous: "Ambiguous, specify plan/option",
  pending: "Looking up…",
};

const Sheet = () => {
  // sessionStorage is an external store and it does not exist while Next
  // pre-renders this on the server. useSyncExternalStore is the supported way
  // to read one: it returns the server snapshot (null) during SSR and the real
  // rows on the very first client render -- no effect, no cascading re-render.
  const uploaded = useSyncExternalStore(
    subscribeToRows,
    loadRows,
    getServerRowsSnapshot
  );

  const dateOrder = useMemo(() => {
    if (!uploaded?.length) return { order: "DMY", confident: true };
    return detectDateOrder(uploaded.map((r) => pick(r, "Date", "TransactionDate")));
  }, [uploaded]);

  // Rows are seeded from the stash but then owned here, because the user edits
  // them. Adjusting the state during render (rather than in an effect) is
  // React's documented pattern for "derive state when the source changes" and
  // avoids the extra render an effect would cost.
  const [rowState, setRowState] = useState({ source: null, rows: [] });
  if (uploaded !== null && rowState.source !== uploaded) {
    setRowState({
      source: uploaded,
      rows: buildRows(uploaded, dateOrder.order).map(priceRow),
    });
  }
  const rows = rowState.rows;
  const setRows = useCallback(
    (updater) =>
      setRowState((current) => ({
        ...current,
        rows: typeof updater === "function" ? updater(current.rows) : updater,
      })),
    []
  );

  // Derived, not stored: a stored `loading` had to be switched off inside the
  // effect for the "nothing uploaded" case, which is a synchronous setState in
  // an effect body and causes a cascading render.
  const [navFetchDone, setNavFetchDone] = useState(false);
  const loading = uploaded === null || (uploaded.length > 0 && !navFetchDone);

  const [error, setError] = useState("");
  const [navDate, setNavDate] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "" });
  const [view, setView] = useState("transactions");
  const reduceMotion = useReducedMotion();
  const order = useColumnOrder("transactions", COLUMNS);

  useEffect(() => {
    // Nothing to fetch while hydrating, or when the stash was empty -- in both
    // cases `loading` is already false by derivation.
    if (uploaded === null || uploaded.length === 0) return;

    let cancelled = false;

    const fetchNAVs = async () => {
      setError("");
      const names = [
        ...new Set(
          buildRows(uploaded, dateOrder.order)
            .map((r) => r.schemeName.trim().toLowerCase())
            .filter(Boolean)
        ),
      ];

      if (names.length === 0) {
        setNavFetchDone(true);
        return;
      }

      try {
        // URLSearchParams encodes the names. Raw interpolation truncated every
        // scheme containing "&" ("Large & Mid Cap", "Banking & PSU Debt").
        const query = new URLSearchParams({ schemes: names.join(",") });
        const response = await fetch(`/api/nav?${query}`);
        if (!response.ok) throw new Error(`NAV service returned ${response.status}`);
        const payload = await response.json();
        if (cancelled) return;

        // Join on the echoed scheme name, never on array position -- the
        // backend dedupes, so index correspondence is not guaranteed.
        const bySchemeName = new Map();
        for (const item of payload?.data ?? []) {
          const key = item?.data?.scheme;
          if (key) bySchemeName.set(key, item);
        }

        setNavDate(payload?.navDate ?? null);
        setRows((current) =>
          current.map((row) => {
            const hit = bySchemeName.get(row.schemeName.trim().toLowerCase());
            if (hit?.statusCode === 200) {
              return priceRow({
                ...row,
                currentNAV: hit.data.nav,
                navDate: hit.data.date,
                matchedScheme: hit.data.matchedScheme,
                lookup: "matched",
              });
            }
            return priceRow({
              ...row,
              lookup: hit?.data?.confidence === "ambiguous" ? "ambiguous" : "notFound",
            });
          })
        );
      } catch (err) {
        if (cancelled) return;
        console.error("NAV fetch failed:", err);
        setError(
          "Could not reach the NAV service. You can still enter NAVs by hand."
        );
        setRows((current) => current.map((r) => priceRow({ ...r, lookup: "notFound" })));
      } finally {
        if (!cancelled) setNavFetchDone(true);
      }
    };

    fetchNAVs();
    return () => {
      cancelled = true;
    };
  }, [uploaded, dateOrder.order, setRows]);

  // Edits address a row by id. The old code passed the index of the *rendered*
  // array into the *filtered* array, so editing under an active search wrote
  // to a different fund's row.
  const handleEdit = useCallback((id, key, value) => {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        if (key === "date") {
          return priceRow({ ...row, rawDate: value, date: parseRowDate(value, "DMY") });
        }
        return priceRow({ ...row, [key]: value });
      })
    );
  }, [setRows]);

  const handleSort = useCallback((key) => {
    setSortConfig((current) =>
      current.key === key && current.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  }, []);

  // Filtering, sorting and searching are derived, never stored. Nothing can
  // write back into a view and desync it from the source rows.
  const visibleRows = useMemo(() => {
    let result = rows;

    const active = Object.entries(filters).filter(([, v]) => v !== "");
    if (active.length) {
      result = result.filter((row) =>
        active.every(([column, value]) => String(row[column] ?? "") === value)
      );
    }

    const term = search.trim().toLowerCase();
    if (term) {
      result = result.filter((row) =>
        [row.folioNo, row.schemeName, row.type, row.rawDate, row.matchedScheme]
          .some((v) => String(v ?? "").toLowerCase().includes(term))
      );
    }

    if (sortConfig.key) {
      const { key, direction } = sortConfig;
      result = [...result].sort((a, b) => {
        let av = a[key];
        let bv = b[key];
        if (key === "date") {
          av = a.date?.getTime() ?? -Infinity;
          bv = b.date?.getTime() ?? -Infinity;
        }
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;

        const an = Number.parseFloat(av);
        const bn = Number.parseFloat(bv);
        const cmp =
          Number.isFinite(an) && Number.isFinite(bn)
            ? an - bn
            : String(av).localeCompare(String(bv));
        return direction === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [rows, filters, search, sortConfig]);

  // Grouped from the rows the user is actually looking at, so filters and
  // search apply to the holdings view and the helper alike.
  const holdings = useMemo(() => groupHoldings(visibleRows), [visibleRows]);
  const holdingsSummary = useMemo(() => summariseHoldings(holdings), [holdings]);

  const unpricedCount = rows.filter((r) => r.status !== "priced").length;

  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen bg-white"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Fetching current NAVs from AMFI…</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="#00b5ef"
            strokeLinecap="round"
            strokeWidth="2"
            d="M12 6.99998C9.1747 6.99987 6.99997 9.24998 7 12C7.00003 14.55 9.02119 17 12 17C14.7712 17 17 14.75 17 12"
          >
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              dur="560ms"
              from="0,12,12"
              repeatCount="indefinite"
              to="360,12,12"
              type="rotate"
            />
          </path>
        </svg>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-800">No data loaded</h1>
        <p className="text-gray-600 max-w-md">
          Upload a CSV to see your holdings. Rows are held in memory only, so a
          page refresh clears them.
        </p>
        <Link href="/" className="btn bg-[#00b5ef] text-white border-none hover:bg-[#0095c7]">
          Upload a CSV
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      className="w-full min-h-screen flex flex-col p-6 bg-white gap-4"
      initial={reduceMotion ? false : pageTransition.initial}
      animate={pageTransition.animate}
      transition={reduceMotion ? { duration: 0 } : pageTransition.transition}
    >
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-sm text-[#00b5ef] hover:underline">
            ← Upload another file
          </Link>
          {navDate && (
            <span className="text-sm text-gray-500">
              NAV as of <strong className="text-gray-700">{navDate}</strong> · source AMFI
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* shrink-0 matters: without it the search input's `w-full` compresses
              this group and clips the second label. */}
          <div
            role="group"
            aria-label="View"
            className="flex shrink-0 border border-[#00b5ef] rounded-lg overflow-hidden"
          >
            {[
              ["transactions", "Transactions", "One row per purchase"],
              ["holdings", "Holdings", "Grouped by folio and scheme, with XIRR per holding"],
            ].map(([value, label, hint]) => (
              <motion.button
                key={value}
                type="button"
                title={hint}
                aria-pressed={view === value}
                onClick={() => setView(value)}
                whileTap={reduceMotion ? undefined : tap}
                transition={{ duration: DURATION.fast, ease: EASE }}
                className={`relative px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                  view === value ? "text-white" : "text-[#00b5ef] hover:bg-[#00b5ef]/10"
                }`}
              >
                {view === value && (
                  <motion.span
                    layoutId="view-pill"
                    className="absolute inset-0 bg-[#00b5ef]"
                    transition={{ duration: reduceMotion ? 0 : DURATION.base, ease: EASE }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </motion.button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search rows"
            className="input border-[#00b5ef] focus:outline-[#00b5ef] w-full min-w-0 max-w-xs"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="alert bg-amber-50 border border-amber-300 text-amber-900">
          {error}
        </div>
      )}

      {!dateOrder.confident && (
        <div role="alert" className="alert bg-amber-50 border border-amber-300 text-amber-900">
          Dates were read as <strong>DD/MM/YYYY</strong>. Every date in this file
          is ambiguous, so check a row before trusting the CAGR, correct any
          date directly in the table.
        </div>
      )}

      {unpricedCount > 0 && (
        <div role="alert" className="alert bg-red-50 border border-red-300 text-red-900">
          <strong>{unpricedCount}</strong> of {rows.length} rows could not be
          priced and are excluded from the totals below. Their reason is shown
          in place of the return.
        </div>
      )}

      <PortfolioSummary rows={rows} />


      <TableFilters rows={rows} filters={filters} onFilterChange={setFilters} />

      {view === "transactions" && (
        <ResetColumnsButton orders={[{ label: "transaction", order }]} />
      )}

      <AnimatePresence mode="wait" initial={false}>
      {view === "holdings" ? (
        <motion.div
          key="holdings"
          initial={reduceMotion ? false : viewTransition.initial}
          animate={viewTransition.animate}
          exit={reduceMotion ? undefined : viewTransition.exit}
          transition={reduceMotion ? { duration: 0 } : viewTransition.transition}
        >
          <HoldingsTable holdings={holdings} />
        </motion.div>
      ) : (
        <motion.div
          key="transactions"
          initial={reduceMotion ? false : viewTransition.initial}
          animate={viewTransition.animate}
          exit={reduceMotion ? undefined : viewTransition.exit}
          transition={reduceMotion ? { duration: 0 } : viewTransition.transition}
        >
      <div className="overflow-auto w-full max-h-[calc(100vh-6rem)] border border-gray-200">
        <table className="table w-max min-w-full bg-white whitespace-nowrap">
          <thead className="sticky top-0 z-10 bg-[#00b5ef] text-white">
            <tr className="group/head">
              {order.columns.map((column, i) => (
                <ColumnHeader
                  key={column.key}
                  column={{ ...column, align: `text-${column.align}` }}
                  index={i}
                  total={order.columns.length}
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  dragIndex={order.dragIndex}
                  overIndex={order.overIndex}
                  handlers={order.handlers}
                  onNudge={order.nudge}
                />
              ))}
            </tr>
          </thead>
          <tbody className="text-black">
            {visibleRows.map((row, index) => (
              <Row
                key={row.id}
                row={row}
                index={index}
                onEdit={handleEdit}
                reduceMotion={reduceMotion}
                columns={order.columns}
              />
            ))}
            </tbody>
          </table>
        </div>
        </motion.div>
      )}
      </AnimatePresence>

      {visibleRows.length === 0 && (
        <p className="text-center text-gray-500 py-6">
          No rows match the current filters.
        </p>
      )}

      <footer className="text-xs text-gray-500 max-w-3xl leading-relaxed space-y-2">
        <p>
          Purchase NAV is taken from your file and is not verified against the
          NAV actually published on that date. Figures are unrealised and
          exclude exit load and tax; expense ratio is already reflected in NAV.
          CAGR is shown per transaction and is not additive across rows; use
          the portfolio XIRR above. This is not investment advice.
        </p>
        <p className="rounded-lg border border-[#00b5ef]/30 bg-[#00b5ef]/5 px-4 py-3 text-[13px] text-gray-700">
          <strong className="text-gray-900">Want to check our working?</strong>{" "}
          Every formula on this page is written out in plain English, including
          what these figures leave out.{" "}
          <Link
            href="/glossary"
            className="font-medium text-[#00b5ef] hover:underline"
          >
            Read how the numbers are calculated &rarr;
          </Link>
        </p>
        <p>
          NAV data{navDate ? ` (as of ${navDate})` : ""} sourced from{" "}
          <a
            href="https://www.amfiindia.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00b5ef] hover:underline"
          >
            AMFI
          </a>
          . This is an unofficial tool, not affiliated with or endorsed by AMFI
          or any AMC. Nothing you upload is stored.
        </p>
      </footer>

      <ChatWidget
        holdings={holdings}
        summary={holdingsSummary}
        navDate={navDate}
      />
    </motion.div>
  );
};

const Row = ({ row, index, onEdit, reduceMotion, columns }) => {
  const priced = row.status === "priced";
  const tone = (value) =>
    value > 0 ? "text-green-700" : value < 0 ? "text-red-600" : "";
  const sign = (value) => (value > 0 ? "+" : "");

  const cell = (column) => {
    switch (column.key) {
      case "folioNo":
        return row.folioNo || "-";
      case "schemeName":
        return (
          <span title={row.matchedScheme ? `Matched: ${row.matchedScheme}` : undefined}>
            {row.schemeName}
            {row.matchedScheme && row.matchedScheme.toLowerCase() !== row.schemeName.toLowerCase() && (
              <span className="block text-[11px] text-gray-500">→ {row.matchedScheme}</span>
            )}
          </span>
        );
      case "type":
        return row.type || "-";
      case "date":
        return (
          <input
            type="date"
            className="input input-ghost w-[140px] p-1 text-center focus:outline-[#00b5ef]"
            aria-label={`Purchase date for ${row.schemeName}`}
            value={formatDateInput(row.date)}
            onChange={(e) => onEdit(row.id, "date", e.target.value)}
          />
        );
      case "amount":
      case "purchaseNAV":
      case "currentNAV":
        return (
          <input
            type="number"
            step="any"
            min="0"
            className="input input-ghost w-[100px] p-1 text-right focus:outline-[#00b5ef]"
            aria-label={`${column.label} for ${row.schemeName}`}
            placeholder={column.key === "currentNAV" && row.lookup !== "matched" ? "enter" : ""}
            value={row[column.key] ?? ""}
            onChange={(e) => onEdit(row.id, column.key, e.target.value)}
          />
        );
      case "units":
        return priced ? formatUnits(row.units) : "-";
      case "currentValue":
        return priced ? formatMoney(row.currentValue) : "-";
      case "absoluteGain":
        return priced ? (
          <span className={tone(row.absoluteGain)}>
            {sign(row.absoluteGain)}
            {formatMoney(row.absoluteGain)}
          </span>
        ) : (
          "-"
        );
      case "absoluteReturn":
        return priced ? (
          <span className={tone(row.absoluteReturn)}>
            {sign(row.absoluteReturn)}
            {formatPercent(row.absoluteReturn)}
          </span>
        ) : (
          "-"
        );
      case "cagr": {
        if (!priced) return "-";
        if (row.cagrOffScale) {
          return (
            <span
              className="text-gray-400 text-xs"
              title={`Held only ${row.holdingDays} day(s), annualising this produces a meaningless number`}
            >
              n/a ({row.holdingDays}d)
            </span>
          );
        }
        if (row.cagr === null) return "-";

        const short = row.annualisedFromShortPeriod;
        return (
          <span
            className={short ? "text-gray-500" : tone(row.cagr)}
            title={
              short
                ? `Held ${row.holdingDays} days. This projects that period out to a full year. It is not a return you have earned. Actual return so far: ${formatPercent(row.absoluteReturn)}.`
                : `Held ${row.holdingDays} days`
            }
          >
            {sign(row.cagr)}
            {formatPercent(row.cagr)}
            {short && (
              <span className="text-[10px] text-gray-400 ml-1">
                ({row.holdingDays}d)
              </span>
            )}
          </span>
        );
      }
      default:
        return row[column.key] ?? "-";
    }
  };

  // Static class names: Tailwind cannot see `text-${column.align}` at build
  // time, so an interpolated class silently compiles to nothing.
  const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

  return (
    <motion.tr
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.18, delay: Math.min(index * 0.012, 0.25) }
      }
      className={`transition-colors ${priced ? "hover:bg-gray-50" : "bg-red-50/40"}`}
    >
      {columns.map((column) => (
        <td
          key={column.key}
          className={`px-2 py-1 tabular-nums align-middle ${ALIGN[column.align]}`}
        >
          {cell(column)}
        </td>
      ))}
      {!priced && (
        <td className="sr-only">
          {row.reason || STATUS_LABEL[row.lookup] || "Not priced"}
        </td>
      )}
    </motion.tr>
  );
};

export default Sheet;
