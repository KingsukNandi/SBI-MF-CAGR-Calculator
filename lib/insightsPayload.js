import { scrubSchemeName, categoriseReason } from "./pii.js";

/**
 * Builds the payload sent to the AI helper.
 *
 * Three rules govern what goes in:
 *
 * 1. **Allow-list, not deny-list.** Every field is written out explicitly
 *    below. Nothing is spread in from a row object, so a field added upstream
 *    cannot silently start being transmitted.
 * 2. **No direct identifiers, ever.** Folio numbers are personal financial
 *    identifiers and useless for explaining a return. Holdings are referred to
 *    by an opaque index.
 * 3. **No rupee amounts unless the user asks for it.** A portfolio's absolute
 *    value is personal financial data. Percentages and ratios carry nearly all
 *    the explanatory value, so amounts are opt-in and off by default.
 *
 * Free text (scheme names, failure reasons) is scrubbed, because those come
 * from the user's own CSV and can contain anything.
 */

const round = (value, dp = 2) =>
  Number.isFinite(value) ? Number(value.toFixed(dp)) : null;

/**
 * Coarse size band, so the model can say "your largest holding" without being
 * told what anything is worth.
 */
const sizeBand = (sharePct) => {
  if (!Number.isFinite(sharePct)) return null;
  if (sharePct >= 40) return "dominant";
  if (sharePct >= 20) return "large";
  if (sharePct >= 10) return "medium";
  if (sharePct >= 3) return "small";
  return "minor";
};

export const buildInsightsPayload = ({
  holdings,
  summary,
  navDate,
  includeAmounts = false,
}) => {
  const priced = holdings.filter((h) => h.status === "priced");

  const payload = {
    navDate: navDate ?? null,
    amountsIncluded: includeAmounts,
    // Stated so the model can caveat correctly rather than guessing.
    caveats: {
      returnsArePreTax: true,
      excludesExitLoad: true,
      expenseRatioAlreadyInNAV: true,
      purchaseNAVIsUserSupplied: true,
      unrealised: true,
    },
    portfolio: summary
      ? {
          holdingCount: summary.holdingCount,
          unpricedHoldings: summary.unpricedHoldings,
          absoluteReturnPct: round(summary.absoluteReturn),
          xirrPct: round(summary.xirr),
        }
      : null,
    holdings: priced.map((h, index) => ({
      // Opaque label: no folio number, no account identifier.
      ref: `H${index + 1}`,
      scheme: scrubSchemeName(h.matchedScheme || h.schemeName),
      plan: h.plan ?? null,
      option: h.option ?? null,
      // Lets the model spot the IDCW understatement without being told.
      isIdcw: /idcw|income distribution/i.test(
        `${h.option ?? ""} ${h.matchedScheme ?? ""} ${h.schemeName ?? ""}`
      ),
      lots: h.lotCount,
      unpricedLots: h.unpricedCount,
      absoluteReturnPct: round(h.absoluteReturn),
      xirrPct: round(h.xirr),
      holdingDays: h.holdingDays,
      annualisedFromShortPeriod: Boolean(h.xirrFromShortPeriod),
      shareOfPortfolioPct:
        summary?.currentValue > 0
          ? round((h.currentValue / summary.currentValue) * 100)
          : null,
      sizeBand:
        summary?.currentValue > 0
          ? sizeBand((h.currentValue / summary.currentValue) * 100)
          : null,
    })),
    unpriced: holdings
      .filter((h) => h.status !== "priced")
      .map((h) => ({
        scheme: scrubSchemeName(h.matchedScheme || h.schemeName),
        lots: h.lotCount,
        // Fixed phrase, not the UI string, which interpolates raw cell content.
        reason: categoriseReason(h.reason),
      })),
  };

  // Amounts are added only on explicit opt-in, and only in aggregate at the
  // portfolio level plus per-holding. Nothing per-transaction.
  if (includeAmounts && summary) {
    payload.portfolio.invested = round(summary.invested);
    payload.portfolio.currentValue = round(summary.currentValue);
    payload.portfolio.absoluteGain = round(summary.absoluteGain);
    payload.holdings.forEach((entry, index) => {
      const source = priced[index];
      entry.invested = round(source.invested);
      entry.currentValue = round(source.currentValue);
      entry.absoluteGain = round(source.absoluteGain);
    });
  }

  return payload;
};

/**
 * Human-readable description of exactly what will be transmitted, shown to the
 * user before they send anything. If this drifts from buildInsightsPayload the
 * disclosure becomes a lie, so keep them together.
 */
export const describePayload = (payload) => {
  const sent = [
    `Scheme names, plan and option for ${payload.holdings.length} holding(s)`,
    "Returns as percentages, holding periods in days, and each holding's share of the portfolio",
    "The NAV date and the reason any row could not be priced",
  ];
  if (payload.amountsIncluded) {
    sent.push("Rupee amounts: total invested, current value and gain");
  }

  const notSent = [
    "Folio numbers",
    "Your name, PAN, Aadhaar, phone or email",
    "The uploaded file itself",
    "Individual transaction dates or amounts",
  ];
  if (!payload.amountsIncluded) {
    notSent.push("Any rupee amount");
  }

  return { sent, notSent };
};
