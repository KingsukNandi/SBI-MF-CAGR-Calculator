/**
 * Everything this app knows about AMFI's NAV feed: fetching, parsing, caching
 * and scheme matching. Deliberately free of HTTP and React so it can be tested
 * directly, the parser lived inside an Express controller before and could not
 * be exercised without standing up a server.
 */

// AMFI publishes one NAV row per scheme at this URL. The old www host 302s here.
// robots.txt on amfiindia.com disallows only /admin/, /login/ and /search/,
// so /spages/ is permitted to automated clients.
export const AMFI_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

export const ATTRIBUTION = {
  source: "AMFI (Association of Mutual Funds in India)",
  url: "https://www.amfiindia.com/spages/NAVAll.txt",
};

// Capped so this endpoint answers "what is my portfolio worth" and cannot be
// walked to mirror AMFI's dataset. A real statement has well under 200 schemes.
export const MAX_SCHEMES_PER_REQUEST = 200;

// AMFI has changed this layout before: it gained the Plan and Option columns,
// which silently shifted NAV from index 4 to 6 and broke every calculation in
// the app while it kept returning HTTP 200. Never hardcode positions, resolve
// them from the header row and fail loudly if a column disappears.
const REQUIRED_COLUMNS = {
  code: /^scheme\s*code$/i,
  isinGrowth: /^isin.*(payout|growth)/i,
  isinReinvest: /^isin.*reinvest/i,
  name: /^scheme\s*name$/i,
  plan: /^plan$/i,
  option: /^option$/i,
  nav: /^net\s*asset\s*value$/i,
  date: /^date$/i,
};

export const resolveColumns = (headerLine) => {
  const headers = String(headerLine ?? "").split(";").map((h) => h.trim());
  const columns = {};

  for (const [key, pattern] of Object.entries(REQUIRED_COLUMNS)) {
    const index = headers.findIndex((h) => pattern.test(h));
    // ISIN columns are nice-to-have; the rest are load-bearing.
    if (index === -1 && !key.startsWith("isin")) {
      throw new Error(
        `AMFI layout changed: no "${key}" column in [${headers.join(", ")}]`
      );
    }
    columns[key] = index;
  }

  return columns;
};

// Strip plan/option/punctuation so "SBI CONTRA FUND" and
// "sbi contra fund - direct plan - growth" collapse to the same key.
export const normalizeName = (name) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/\b(direct|regular)\b/g, "")
    .replace(/\b(growth|idcw|income distribution cum capital withdrawal)\b/g, "")
    .replace(/\b(plan|option)\b/g, "")
    .replace(/[\u002D\u2013\u2014,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const readPlan = (value) => {
  if (/direct/i.test(value)) return "direct";
  if (/regular/i.test(value)) return "regular";
  return null;
};

export const readOption = (value) => {
  if (/idcw|income distribution/i.test(value)) return "idcw";
  if (/growth/i.test(value)) return "growth";
  return null;
};

// A query arrives as a display name, so plan and option still have to be
// inferred from it, unlike AMFI's rows, which now carry their own columns.
export const parseQuery = (query) => ({
  name: normalizeName(query),
  plan: readPlan(query),
  option: readOption(query),
});

export const parseSnapshot = (text) => {
  const lines = String(text ?? "").split("\n");
  const columns = resolveColumns(lines[0]);

  const byName = new Map();
  const byIsin = new Map();
  const byCode = new Map();
  let navDate = null;

  for (const line of lines.slice(1)) {
    const parts = line.split(";");
    if (parts.length <= columns.date) continue;

    const nav = Number.parseFloat(parts[columns.nav]);
    if (!Number.isFinite(nav) || nav <= 0) continue;

    const scheme = {
      code: parts[columns.code].trim(),
      name: parts[columns.name].trim(),
      plan: readPlan(parts[columns.plan]),
      option: readOption(parts[columns.option]),
      nav: parts[columns.nav].trim(),
      date: parts[columns.date].trim(),
    };

    const key = normalizeName(scheme.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(scheme);

    byCode.set(scheme.code, scheme);
    for (const isinColumn of [columns.isinGrowth, columns.isinReinvest]) {
      const isin = isinColumn === -1 ? "-" : parts[isinColumn].trim();
      if (isin && isin !== "-") byIsin.set(isin, scheme);
    }

    navDate ??= scheme.date;
  }

  // If a layout change slips past resolveColumns, refuse to serve garbage
  // rather than emitting NaN for months the way the previous version did.
  if (byName.size === 0) throw new Error("AMFI feed parsed to zero schemes");

  return { byName, byIsin, byCode, navDate, checkedAt: Date.now() };
};

/**
 * Resolve one scheme name to a NAV row.
 *
 * Never returns a best guess. A Regular-plan NAV shown against a Direct-plan
 * holding is a confidently wrong number, which is worse for the user than
 * reporting nothing, so an ambiguous match returns its candidates instead.
 */
export const lookup = (index, query) => {
  const { name, plan, option } = parseQuery(query);

  const candidates = index.byName.get(name) || [];
  const matches = candidates.filter(
    (entry) =>
      (!plan || entry.plan === plan) && (!option || entry.option === option)
  );

  if (matches.length === 1) return { match: matches[0], confidence: "exact" };
  if (matches.length > 1) {
    return { match: null, confidence: "ambiguous", candidates: matches };
  }
  return { match: null, confidence: "none", candidates: [] };
};

// -- Snapshot cache -------------------------------------------------------
//
// AMFI's terms restrict storing "any significant portion" of the site, so this
// index is deliberately memory-only and process-lifetime: nothing is written to
// disk and a restart re-fetches. See README "Data source and AMFI terms".
//
// On serverless this cache is per-instance and is discarded when the instance
// is torn down, so a cold start pays a full ~1.5 MB download. Warm instances
// revalidate with a conditional GET and take a 0-byte 304.

const REVALIDATE_AFTER_MS = Number(
  process.env.NAV_REVALIDATE_MS ?? 60 * 60 * 1000
);

// Identify honestly so AMFI can see who is calling and reach us or block us.
const USER_AGENT =
  process.env.AMFI_USER_AGENT ||
  "MF-Returns-Calculator/2.0 (personal portfolio calculator; +contact via repository)";

const FETCH_TIMEOUT_MS = 30000;

let snapshot = null;
let inFlight = null;

const fetchSnapshot = async () => {
  const headers = { "User-Agent": USER_AGENT };
  // Revalidate rather than re-download.
  if (snapshot?.lastModified) headers["If-Modified-Since"] = snapshot.lastModified;
  if (snapshot?.etag) headers["If-None-Match"] = snapshot.etag;

  const response = await fetch(AMFI_URL, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // Next caches fetches by default; this data is managed in memory here.
    cache: "no-store",
  });

  if (response.status === 304 && snapshot) {
    snapshot.checkedAt = Date.now();
    return snapshot;
  }

  if (!response.ok) {
    throw new Error(`AMFI responded ${response.status}`);
  }

  const parsed = parseSnapshot(await response.text());
  parsed.lastModified = response.headers.get("last-modified");
  parsed.etag = response.headers.get("etag");
  snapshot = parsed;
  return snapshot;
};

export const getSnapshot = async () => {
  const fresh = snapshot && Date.now() - snapshot.checkedAt < REVALIDATE_AFTER_MS;
  if (fresh) return snapshot;

  // Collapse concurrent misses into a single upstream request.
  inFlight ??= fetchSnapshot().finally(() => {
    inFlight = null;
  });

  try {
    return await inFlight;
  } catch (err) {
    // Serve what we have rather than failing the user outright.
    if (snapshot) {
      console.warn("AMFI revalidation failed, serving cached NAVs:", err.message);
      return snapshot;
    }
    throw err;
  }
};

// Test seam: lets the parser and matcher be exercised without network access.
export const __setSnapshotForTests = (value) => {
  snapshot = value;
  inFlight = null;
};
