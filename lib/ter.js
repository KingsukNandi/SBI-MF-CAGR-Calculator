import { readSheetRows, serialToISODate } from "./xlsx.js";
import { normalizeName } from "./amfi.js";

/**
 * Total Expense Ratio, from AMFI.
 *
 * SEBI's Master Circular (20 Mar 2026) para 11.2.2 requires AMCs to publish TER
 * "scheme-wise, date-wise... on the website of AMFI in a downloadable
 * spreadsheet format, as per Format No. 7E", and 11.2.4 adds that it "shall be
 * in a downloadable spreadsheet and a machine readable format".
 *
 * TER IS ALREADY DEDUCTED FROM NAV. Para 9.2.3: "All expenses and incomes
 * accrued upto the date of valuation shall be incorporated into the computation
 * of net asset value... management fees and other periodic expenses shall be
 * accrued on a day-to-day basis." Every return this app computes is therefore
 * already net of it.
 *
 * So TER is DISPLAY ONLY. It must never reach lib/calculateUtils.js, and it
 * must never be subtracted from a return or multiplied into a rupee figure.
 * There is a test asserting the first of those.
 */

const TER_URL = "https://www.amfiindia.com/api/populate-te-rdata-revised";

// The file carries one row per scheme per day, and reporting lags: the current
// day typically has a fraction of the schemes. Anything below this share of the
// best-covered day is treated as still filling in.
const COVERAGE_THRESHOLD = 0.8;

const REQUIRED_COLUMNS = {
  name: /^scheme\s*name$/i,
  date: /^ter\s*date$/i,
  regular: /^regular\s*plan.*total\s*ter/i,
  direct: /^direct\s*plan.*total\s*ter/i,
};

// Optional: nice to show, not worth failing over.
const OPTIONAL_COLUMNS = {
  category: /^scheme\s*category$/i,
};

/**
 * Resolve columns from the header row.
 *
 * AMFI renamed these fields at FY2026-27 (R_BaseTER became R_BER and so on),
 * which is the same failure mode that silently broke the NAV parser. Resolving
 * by header and throwing on absence means the next rename fails loudly.
 */
export const resolveTerColumns = (header) => {
  const cells = (header ?? []).map((h) => String(h ?? "").trim());
  const columns = {};

  for (const [key, pattern] of Object.entries(REQUIRED_COLUMNS)) {
    const index = cells.findIndex((c) => pattern.test(c));
    if (index === -1) {
      throw new Error(
        `AMFI TER layout changed: no "${key}" column in [${cells.join(", ")}]`
      );
    }
    columns[key] = index;
  }
  for (const [key, pattern] of Object.entries(OPTIONAL_COLUMNS)) {
    columns[key] = cells.findIndex((c) => pattern.test(c));
  }
  return columns;
};

const toPercent = (value) => {
  const number = Number.parseFloat(value);
  // A TER above 3% is outside anything SEBI permits, so treat it as a bad cell
  // rather than showing an implausible figure.
  return Number.isFinite(number) && number >= 0 && number <= 3 ? number : null;
};

/**
 * Build a lookup keyed by normalised scheme name.
 *
 * The TER file is keyed by NSDL Scheme Code, which does not appear in
 * NAVAll.txt, so the join is on the scheme name. It uses the SAME normaliser as
 * the NAV matcher, which measured 98.8% coverage against currently-priced
 * schemes. The ~1% that miss are segregated portfolios and unclaimed-dividend
 * pools; they render as no data rather than a guess.
 */
export const parseTerSheet = (rows) => {
  if (!rows?.length) throw new Error("AMFI TER sheet is empty");
  const columns = resolveTerColumns(rows[0]);

  // Pick the best-covered date, not the most recent: "daily" is aspirational
  // and today is usually only partly reported.
  const perDate = new Map();
  for (const row of rows.slice(1)) {
    const serial = row[columns.date];
    if (!serial) continue;
    perDate.set(serial, (perDate.get(serial) ?? 0) + 1);
  }
  if (perDate.size === 0) throw new Error("AMFI TER sheet has no dated rows");

  const peak = Math.max(...perDate.values());
  const usable = [...perDate.entries()]
    .filter(([, count]) => count >= peak * COVERAGE_THRESHOLD)
    .sort((a, b) => Number(b[0]) - Number(a[0]));
  const [chosenSerial, chosenCount] = usable[0];

  const byName = new Map();
  for (const row of rows.slice(1)) {
    if (row[columns.date] !== chosenSerial) continue;
    const key = normalizeName(row[columns.name]);
    if (!key) continue;
    const regular = toPercent(row[columns.regular]);
    const direct = toPercent(row[columns.direct]);
    if (regular === null && direct === null) continue;
    byName.set(key, {
      regular,
      direct,
      category: columns.category === -1 ? null : row[columns.category] || null,
    });
  }

  if (byName.size === 0) throw new Error("AMFI TER sheet parsed to zero schemes");

  return {
    byName,
    terDate: serialToISODate(chosenSerial),
    schemeCount: chosenCount,
    checkedAt: Date.now(),
  };
};

/** Look up one scheme's TER for a given plan. Never guesses. */
export const lookupTer = (index, schemeName, plan) => {
  if (!index) return null;
  const entry = index.byName.get(normalizeName(schemeName));
  if (!entry) return null;
  const value = plan === "direct" ? entry.direct : plan === "regular" ? entry.regular : null;
  if (value === null) return null;
  return { ter: value, regular: entry.regular, direct: entry.direct, date: index.terDate };
};

// -- Snapshot cache -------------------------------------------------------
//
// Same posture as the NAV snapshot: memory only, nothing on disk. TER changes
// at most daily and the chosen date is usually a few days back, so this is
// refreshed far less often than NAV.

const REFRESH_AFTER_MS = Number(process.env.TER_REFRESH_MS ?? 12 * 60 * 60 * 1000);
const FETCH_TIMEOUT_MS = 45000;

const USER_AGENT =
  process.env.AMFI_USER_AGENT ||
  "MF-Returns-Calculator/2.0 (personal portfolio calculator; +contact via repository)";

let snapshot = null;
let inFlight = null;

const currentMonth = (now = new Date()) =>
  `${String(now.getUTCMonth() + 1).padStart(2, "0")}-${now.getUTCFullYear()}`;

const fetchTer = async (month) => {
  const url = `${TER_URL}?MF_ID=All&Month=${month}&strCat=All&strType=All&excel=true`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`AMFI TER responded ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return parseTerSheet(readSheetRows(buffer));
};

/**
 * TER is enrichment, never on the critical path. Callers get null rather than
 * an error, so a TER outage shows an empty column instead of breaking pricing.
 */
export const getTerSnapshot = async () => {
  if (snapshot && Date.now() - snapshot.checkedAt < REFRESH_AFTER_MS) return snapshot;

  inFlight ??= (async () => {
    try {
      return await fetchTer(currentMonth());
    } catch (err) {
      // Early in a month the current file can be sparse or absent; the previous
      // month still holds a fully reported date.
      const previous = new Date();
      previous.setUTCDate(0);
      console.warn(`TER: current month failed (${err.message}), trying previous`);
      return fetchTer(currentMonth(previous));
    }
  })().finally(() => {
    inFlight = null;
  });

  try {
    snapshot = await inFlight;
    return snapshot;
  } catch (err) {
    console.warn("TER unavailable:", err.message);
    return snapshot ?? null;
  }
};

export const __setTerSnapshotForTests = (value) => {
  snapshot = value;
  inFlight = null;
};
