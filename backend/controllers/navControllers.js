import axios from "axios";

// AMFI publishes one NAV row per scheme at this URL. The old www host 302s here.
// robots.txt on amfiindia.com disallows only /admin/, /login/ and /search/,
// so /spages/ is permitted to automated clients.
const AMFI_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

const ATTRIBUTION = {
  source: "AMFI (Association of Mutual Funds in India)",
  url: "https://www.amfiindia.com/spages/NAVAll.txt",
};

const MAX_SCHEMES_PER_REQUEST = 200;

// AMFI has changed this layout before (it gained the Plan and Option columns,
// which silently shifted NAV from index 4 to 6). Never hardcode positions --
// resolve them from the header row and fail loudly if a column disappears.
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

const resolveColumns = (headerLine) => {
  const headers = headerLine.split(";").map((h) => h.trim());
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
const normalizeName = (name) =>
  name
    .toLowerCase()
    .replace(/\b(direct|regular)\b/g, "")
    .replace(/\b(growth|idcw|income distribution cum capital withdrawal)\b/g, "")
    .replace(/\b(plan|option)\b/g, "")
    .replace(/[-–—,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const readPlan = (value) => {
  if (/direct/i.test(value)) return "direct";
  if (/regular/i.test(value)) return "regular";
  return null;
};

const readOption = (value) => {
  if (/idcw|income distribution/i.test(value)) return "idcw";
  if (/growth/i.test(value)) return "growth";
  return null;
};

// The query arrives as a display name, so plan and option still have to be
// inferred from it -- unlike the AMFI rows, which now carry their own columns.
const parseQuery = (query) => ({
  name: normalizeName(query),
  plan: readPlan(query),
  option: readOption(query),
});

const parseSnapshot = (text) => {
  const lines = text.split("\n");
  const columns = resolveColumns(lines[0]);

  const byName = new Map();
  const byIsin = new Map();
  const byCode = new Map();

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
  }

  // If a layout change slips past resolveColumns, refuse to serve garbage.
  if (byName.size === 0) throw new Error("AMFI feed parsed to zero schemes");

  return { byName, byIsin, byCode, checkedAt: Date.now() };
};

// AMFI's terms restrict storing "any significant portion" of the site, so this
// index is deliberately memory-only and process-lifetime: nothing is ever
// written to disk, and a restart re-fetches. See README "Data source and AMFI
// terms" before changing this.
//
// AMFI republishes once a day and supports conditional GET, so we revalidate
// with If-Modified-Since and take a 0-byte 304 when nothing has changed
// rather than pulling 1.5 MB again.
const REVALIDATE_AFTER_MS = Number(process.env.NAV_REVALIDATE_MS ?? 60 * 60 * 1000);

// Identify honestly so AMFI can see who is calling and reach us or block us.
const USER_AGENT =
  process.env.AMFI_USER_AGENT ||
  "MF-Returns-Calculator/1.0 (personal portfolio calculator; +contact via repository)";

let snapshot = null;
let inFlight = null;

const fetchSnapshot = async () => {
  const headers = { "User-Agent": USER_AGENT };
  // Revalidate instead of re-downloading.
  if (snapshot?.lastModified) headers["If-Modified-Since"] = snapshot.lastModified;
  if (snapshot?.etag) headers["If-None-Match"] = snapshot.etag;

  const response = await axios.get(AMFI_URL, {
    timeout: 30000,
    responseType: "text",
    headers,
    // Treat 304 as success so axios does not throw on "nothing changed".
    validateStatus: (status) => status === 200 || status === 304,
  });

  if (response.status === 304 && snapshot) {
    snapshot.checkedAt = Date.now();
    return snapshot;
  }

  const parsed = parseSnapshot(response.data);
  parsed.lastModified = response.headers["last-modified"] ?? null;
  parsed.etag = response.headers["etag"] ?? null;
  parsed.checkedAt = Date.now();
  snapshot = parsed;
  return snapshot;
};

const getSnapshot = async () => {
  const fresh = snapshot && Date.now() - snapshot.checkedAt < REVALIDATE_AFTER_MS;
  if (fresh) return snapshot;

  // Collapse concurrent misses into a single upstream request.
  if (!inFlight) {
    inFlight = fetchSnapshot().finally(() => {
      inFlight = null;
    });
  }

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

const lookup = (index, query) => {
  const { name, plan, option } = parseQuery(query);

  const candidates = index.byName.get(name) || [];
  const matches = candidates.filter(
    (entry) =>
      (!plan || entry.plan === plan) && (!option || entry.option === option)
  );

  if (matches.length === 1) return { match: matches[0], confidence: "exact" };

  // Never silently pick one: a Regular NAV shown for a Direct holding is a
  // confidently wrong number, which is worse than reporting nothing.
  if (matches.length > 1) {
    return { match: null, confidence: "ambiguous", candidates: matches };
  }

  return { match: null, confidence: "none" };
};

export const getNav = async (req, res) => {
  const rawSchemes = req.query.schemes;

  if (!rawSchemes) {
    return res
      .status(400)
      .json({ status: false, error: "No schemes provided" });
  }

  const schemeList = rawSchemes
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Capped so this endpoint answers "what is my portfolio worth" and cannot be
  // walked to mirror AMFI's dataset. A real statement has well under 200
  // distinct schemes; the frontend dedupes before sending.
  if (schemeList.length === 0 || schemeList.length > MAX_SCHEMES_PER_REQUEST) {
    return res.status(400).json({
      status: false,
      error: `Provide between 1 and ${MAX_SCHEMES_PER_REQUEST} schemes`,
    });
  }

  try {
    const index = await getSnapshot();

    const results = schemeList.map((query) => {
      const { match, confidence, candidates } = lookup(index, query);

      if (match) {
        return {
          statusCode: 200,
          // `scheme` echoes the request so the client can join on it instead
          // of trusting array position.
          data: {
            scheme: query,
            matchedScheme: match.name,
            plan: match.plan,
            option: match.option,
            schemeCode: match.code,
            nav: match.nav,
            date: match.date,
            confidence,
          },
        };
      }

      return {
        statusCode: 404,
        data: { scheme: query, confidence },
        error:
          confidence === "ambiguous"
            ? `Matched ${candidates.length} schemes; specify plan and option`
            : "Not found",
      };
    });

    const unmatched = results.filter((r) => r.statusCode !== 200).length;

    // Ask intermediaries not to retain this response: it is derived from AMFI
    // data and is scoped to one user's holdings.
    res.set("Cache-Control", "private, no-store");

    res.status(200).json({
      status: true,
      navDate: index.byName.values().next().value?.[0]?.date ?? null,
      attribution: ATTRIBUTION,
      matched: results.length - unmatched,
      unmatched,
      data: results,
    });
  } catch (err) {
    console.error("NAV lookup failed:", err.message);
    res.status(502).json({ status: false, error: "Failed to fetch NAV data" });
  }
};
