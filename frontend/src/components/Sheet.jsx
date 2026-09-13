import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import TableFilters from "./TableFilters";
import PortfolioSummary from "./PortfolioSummary";
import {
  computeRow,
  parseRowDate,
  detectDateOrder,
  formatDateInput,
  formatMoney,
  formatPercent,
  formatUnits,
} from "../utils/calculateUtils";

const BASE_URL =
  import.meta.env.MODE === "development" ? "http://localhost:3000" : "";

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
  ambiguous: "Ambiguous — specify plan/option",
  pending: "Looking up…",
};

const Sheet = () => {
  const location = useLocation();
  const uploaded = location.state?.data;

  const dateOrder = useMemo(() => {
    if (!uploaded?.length) return { order: "DMY", confident: true };
    return detectDateOrder(uploaded.map((r) => pick(r, "Date", "TransactionDate")));
  }, [uploaded]);

  const [rows, setRows] = useState(() =>
    uploaded?.length ? buildRows(uploaded, dateOrder.order).map(priceRow) : []
  );
  const [loading, setLoading] = useState(Boolean(uploaded?.length));
  const [error, setError] = useState("");
  const [navDate, setNavDate] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "" });

  useEffect(() => {
    if (!uploaded?.length) {
      setLoading(false);
      return;
    }

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
        setLoading(false);
        return;
      }

      try {
        // params: lets axios encode the names. Raw interpolation truncated
        // every scheme containing "&" ("Large & Mid Cap", "Banking & PSU").
        const { data: payload } = await axios.get(`${BASE_URL}/api/nav`, {
          params: { schemes: names.join(",") },
        });
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
        if (!cancelled) setLoading(false);
      }
    };

    fetchNAVs();
    return () => {
      cancelled = true;
    };
  }, [uploaded, dateOrder.order]);

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
  }, []);

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
        <Link to="/" className="btn bg-[#00b5ef] text-white border-none hover:bg-[#0095c7]">
          Upload a CSV
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      className="w-full min-h-screen flex flex-col p-6 bg-white gap-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-baseline gap-3">
          <Link to="/" className="text-sm text-[#00b5ef] hover:underline">
            ← Upload another file
          </Link>
          {navDate && (
            <span className="text-sm text-gray-500">
              NAV as of <strong className="text-gray-700">{navDate}</strong> · source AMFI
            </span>
          )}
        </div>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search rows"
          className="input border-[#00b5ef] focus:outline-[#00b5ef] w-full max-w-xs"
        />
      </div>

      {error && (
        <div role="alert" className="alert bg-amber-50 border border-amber-300 text-amber-900">
          {error}
        </div>
      )}

      {!dateOrder.confident && (
        <div role="alert" className="alert bg-amber-50 border border-amber-300 text-amber-900">
          Dates were read as <strong>DD/MM/YYYY</strong>. Every date in this file
          is ambiguous, so check a row before trusting the CAGR — correct any
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

      <div className="overflow-auto w-full max-h-[calc(100vh-6rem)] border border-gray-200">
        <table className="table w-full bg-white">
          <thead className="sticky top-0 z-10 bg-[#00b5ef] text-white">
            <tr>
              {COLUMNS.map((column) => {
                const sorted = sortConfig.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      sorted
                        ? sortConfig.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="p-0 text-center"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className="w-full px-3 py-2 hover:bg-[#0095c7] focus-visible:outline-2 focus-visible:outline-white cursor-pointer font-semibold"
                    >
                      {column.label}
                      {sorted ? (sortConfig.direction === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="text-black">
            {visibleRows.map((row) => (
              <Row key={row.id} row={row} onEdit={handleEdit} />
            ))}
          </tbody>
        </table>
      </div>

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
          CAGR is shown per transaction and is not additive across rows — use
          the portfolio XIRR above. This is not investment advice.
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
    </motion.div>
  );
};

const Row = ({ row, onEdit }) => {
  const priced = row.status === "priced";
  const tone = (value) =>
    value > 0 ? "text-green-700" : value < 0 ? "text-red-600" : "";
  const sign = (value) => (value > 0 ? "+" : "");

  const cell = (column) => {
    switch (column.key) {
      case "folioNo":
        return row.folioNo || "—";
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
        return row.type || "—";
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
        return priced ? formatUnits(row.units) : "—";
      case "currentValue":
        return priced ? formatMoney(row.currentValue) : "—";
      case "absoluteGain":
        return priced ? (
          <span className={tone(row.absoluteGain)}>
            {sign(row.absoluteGain)}
            {formatMoney(row.absoluteGain)}
          </span>
        ) : (
          "—"
        );
      case "absoluteReturn":
        return priced ? (
          <span className={tone(row.absoluteReturn)}>
            {sign(row.absoluteReturn)}
            {formatPercent(row.absoluteReturn)}
          </span>
        ) : (
          "—"
        );
      case "cagr": {
        if (!priced) return "—";
        if (row.cagrOffScale) {
          return (
            <span
              className="text-gray-400 text-xs"
              title={`Held only ${row.holdingDays} day(s) — annualising this produces a meaningless number`}
            >
              n/a ({row.holdingDays}d)
            </span>
          );
        }
        if (row.cagr === null) return "—";

        const short = row.annualisedFromShortPeriod;
        return (
          <span
            className={short ? "text-gray-500" : tone(row.cagr)}
            title={
              short
                ? `Held ${row.holdingDays} days. This projects that period out to a full year — it is not a return you have earned. Actual return so far: ${formatPercent(row.absoluteReturn)}.`
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
        return row[column.key] ?? "—";
    }
  };

  // Static class names: Tailwind cannot see `text-${column.align}` at build
  // time, so an interpolated class silently compiles to nothing.
  const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

  return (
    <tr className={`hover:bg-gray-50 ${priced ? "" : "bg-red-50/40"}`}>
      {COLUMNS.map((column) => (
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
    </tr>
  );
};

export default Sheet;
