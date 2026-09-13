const MS_PER_DAY = 24 * 60 * 60 * 1000;
// A flat 365-day year, matching Excel's and Google Sheets' XIRR. Using 365.25
// here would be marginally better calendar arithmetic but would make two things
// worse that matter more: CAGR would no longer reconcile with any spreadsheet,
// and a single-lot holding -- which is a lump sum, so its CAGR and its XIRR are
// the same quantity -- would print two different numbers in adjacent columns.
// The difference is ~1 basis point over five years.
const DAYS_PER_YEAR = 365;

// Build dates in UTC so a row never shifts a day when the browser's timezone
// is applied. The CSV carries calendar dates, not instants.
const utcDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day));

const isRealDate = (date, year, month, day) =>
  date instanceof Date &&
  !Number.isNaN(date.getTime()) &&
  date.getUTCFullYear() === year &&
  date.getUTCMonth() === month - 1 &&
  date.getUTCDate() === day;

/**
 * Parse one CSV date. `order` disambiguates the slash formats, which are
 * genuinely ambiguous: 03/07/2021 is 7 March in the US and 3 July in India.
 * Returns null rather than an Invalid Date, so callers cannot accidentally
 * render one (`.toISOString()` on an Invalid Date throws mid-render).
 */
export const parseRowDate = (value, order = "DMY") => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;

  // ISO: 2021-07-03
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    const date = utcDate(y, m, d);
    return isRealDate(date, y, m, d) ? date : null;
  }

  // Separated: 03/07/2021, 03-07-2021, 03.07.2021
  const parts = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (parts) {
    const first = Number(parts[1]);
    const second = Number(parts[2]);
    let year = Number(parts[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;

    // A value above 12 can only be a day, whatever the stated order.
    let day = order === "MDY" ? second : first;
    let month = order === "MDY" ? first : second;
    if (first > 12) {
      day = first;
      month = second;
    } else if (second > 12) {
      day = second;
      month = first;
    }

    const date = utcDate(year, month, day);
    return isRealDate(date, year, month, day) ? date : null;
  }

  // 11-Sep-2026, as AMFI publishes it
  const named = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (named) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const month = months.indexOf(named[2].toLowerCase()) + 1;
    const day = Number(named[1]);
    const year = Number(named[3]);
    if (month === 0) return null;
    const date = utcDate(year, month, day);
    return isRealDate(date, year, month, day) ? date : null;
  }

  return null;
};

/**
 * Decide MDY vs DMY for a whole column at once. A single row is often
 * ambiguous; across a column, one value with a first component above 12
 * settles it. Returns the order plus whether the evidence was conclusive,
 * so the UI can tell the user what it assumed.
 */
export const detectDateOrder = (values) => {
  let firstOver12 = 0;
  let secondOver12 = 0;

  for (const value of values) {
    const parts = String(value ?? "").trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.]\d{2,4}$/);
    if (!parts) continue;
    if (Number(parts[1]) > 12) firstOver12++;
    if (Number(parts[2]) > 12) secondOver12++;
  }

  if (firstOver12 && !secondOver12) return { order: "DMY", confident: true };
  if (secondOver12 && !firstOver12) return { order: "MDY", confident: true };
  // Conflicting evidence means the column mixes formats — flag it.
  if (firstOver12 && secondOver12) return { order: "DMY", confident: false };
  return { order: "DMY", confident: false };
};

export const formatDateInput = (date) =>
  date ? date.toISOString().slice(0, 10) : "";

export const yearsBetween = (from, to = new Date()) => {
  if (!from || !to) return null;
  const years = (to.getTime() - from.getTime()) / (MS_PER_DAY * DAYS_PER_YEAR);
  return Number.isFinite(years) ? years : null;
};

/**
 * The single source of truth for every derived number on a row. Both the
 * initial load and the edit path call this, so a row's values can never
 * depend on whether the user has touched it.
 *
 * Value is always units * NAV. It is never reconstructed from CAGR --
 * routing money through an annualised rate is what produced the three
 * different answers the old code gave for one holding.
 */
export const computeRow = ({ amount, startNAV, endNAV, purchaseDate, asOf }) => {
  const invested = Number.parseFloat(amount);
  const start = Number.parseFloat(startNAV);
  const end = Number.parseFloat(endNAV);

  if (!Number.isFinite(invested) || invested <= 0) {
    return { status: "unpriced", reason: "Amount missing or not a number" };
  }
  if (!Number.isFinite(start) || start <= 0) {
    return { status: "unpriced", reason: "Purchase NAV missing or not a number" };
  }
  if (!Number.isFinite(end) || end <= 0) {
    return { status: "unpriced", reason: "Current NAV unavailable" };
  }

  const units = invested / start;
  const currentValue = units * end;
  const absoluteReturn = (end / start - 1) * 100;
  const years = yearsBetween(purchaseDate, asOf);

  // CAGR is reported for every holding, but under a year it is an
  // extrapolation rather than a measurement -- six weeks of movement projected
  // out as if it repeated all year. `annualisedFromShortPeriod` lets the UI
  // show the number while marking it, and it goes fully unstable as the period
  // approaches zero, so cap what we are willing to display.
  const cagr =
    years !== null && years > 0
      ? ((end / start) ** (1 / years) - 1) * 100
      : null;

  const MAX_DISPLAYABLE_CAGR = 1e6; // beyond this the figure is noise, not signal

  return {
    status: "priced",
    units,
    currentValue,
    absoluteGain: currentValue - invested,
    absoluteReturn,
    years,
    holdingDays: years === null ? null : Math.round(years * 365.25),
    cagr:
      cagr !== null && Math.abs(cagr) <= MAX_DISPLAYABLE_CAGR ? cagr : null,
    cagrOffScale: cagr !== null && Math.abs(cagr) > MAX_DISPLAYABLE_CAGR,
    annualisedFromShortPeriod: years !== null && years < 1,
  };
};

/**
 * Money-weighted return across irregular cashflows -- the right measure when
 * one fund has many purchases on different dates. Per-row CAGRs cannot be
 * averaged to get this.
 *
 * flows: [{ date: Date, amount: Number }] with investments negative and the
 * current holding value as a final positive flow.
 */
export const xirr = (flows) => {
  if (!Array.isArray(flows) || flows.length < 2) return null;

  const valid = flows.filter(
    (f) => f.date instanceof Date && Number.isFinite(f.amount)
  );
  if (valid.length < 2) return null;

  const hasInflow = valid.some((f) => f.amount > 0);
  const hasOutflow = valid.some((f) => f.amount < 0);
  if (!hasInflow || !hasOutflow) return null; // no sign change, no root

  const t0 = Math.min(...valid.map((f) => f.date.getTime()));
  const years = valid.map((f) => (f.date.getTime() - t0) / (MS_PER_DAY * 365));

  const npv = (rate) =>
    valid.reduce((sum, f, i) => sum + f.amount / (1 + rate) ** years[i], 0);

  // Newton-Raphson is fast but diverges on sign-alternating flows, so fall
  // back to bisection over a bracketed range.
  let rate = 0.1;
  for (let i = 0; i < 50; i++) {
    const value = npv(rate);
    if (Math.abs(value) < 1e-7) return rate * 100;
    const slope = (npv(rate + 1e-6) - value) / 1e-6;
    if (!Number.isFinite(slope) || slope === 0) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - rate) < 1e-9) return next * 100;
    rate = next;
  }

  let low = -0.9999;
  let high = 100;
  if (npv(low) * npv(high) > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-9) return mid * 100;
    if (npv(low) * value < 0) high = mid;
    else low = mid;
  }
  return ((low + high) / 2) * 100;
};

const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export const formatMoney = (value) =>
  Number.isFinite(value) ? rupee.format(value) : "—";

export const formatPercent = (value, digits = 2) =>
  Number.isFinite(value) ? `${value.toFixed(digits)}%` : "—";

export const formatUnits = (value) =>
  Number.isFinite(value) ? value.toFixed(4) : "—";
