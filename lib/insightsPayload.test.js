import { describe, it, expect } from "vitest";
import { buildInsightsPayload, describePayload } from "./insightsPayload.js";

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const holding = (over = {}) => ({
  key: "k", folioNo: "10234567",
  schemeName: "SBI Contra Fund - Direct Plan - Growth",
  matchedScheme: "SBI CONTRA FUND", plan: "direct", option: "growth",
  status: "priced", lotCount: 3, pricedCount: 3, unpricedCount: 0,
  units: 190.5, invested: 50000, currentValue: 79713.66, absoluteGain: 29713.66,
  absoluteReturn: 59.427, averageNAV: 262.46, xirr: 13.0312, holdingDays: 1800,
  xirrFromShortPeriod: false, firstPurchase: utc(2021, 11, 10), lots: [], ...over,
});
const summary = {
  holdingCount: 2, unpricedHoldings: 1, invested: 198000, currentValue: 290493.6,
  absoluteGain: 92493.6, absoluteReturn: 46.714, xirr: 10.5312,
};
const build = (over = {}) =>
  buildInsightsPayload({ holdings: [holding()], summary, navDate: "11-Sep-2026", ...over });

describe("redaction", () => {
  // The load-bearing privacy property.
  it("never includes folio numbers anywhere in the payload", () => {
    const s = JSON.stringify(buildInsightsPayload({
      holdings: [holding(), holding({ folioNo: "99887766", key: "k2" })],
      summary, navDate: "11-Sep-2026",
    }));
    expect(s).not.toContain("10234567");
    expect(s).not.toContain("99887766");
    // Word-boundary: "shareOfPortfolioPct" legitimately contains "folio".
    expect(s).not.toMatch(/\bfolio\b/i);
  });

  it("refers to holdings by an opaque ref instead", () => {
    const p = buildInsightsPayload({
      holdings: [holding(), holding({ key: "k2" })], summary, navDate: "x",
    });
    expect(p.holdings.map((h) => h.ref)).toEqual(["H1", "H2"]);
  });

  it("does not carry the raw lot rows", () => {
    const p = build({ holdings: [holding({ lots: [{ folioNo: "10234567" }] })] });
    expect(p.holdings[0].lots).toBe(3);           // a count, not the array
    expect(JSON.stringify(p)).not.toContain("10234567");
  });

  it("scrubs identifiers pasted into a scheme name", () => {
    const p = build({ holdings: [holding({ matchedScheme: null, schemeName: "Fund ABCDE1234F" })] });
    expect(JSON.stringify(p)).not.toContain("ABCDE1234F");
  });

  // The UI reason interpolates raw cell content from the user's file.
  it("reduces an unpriced reason to a fixed phrase", () => {
    const p = build({
      holdings: [holding({ status: "unpriced", reason: 'Unreadable date "13/45/2021"' })],
    });
    expect(p.unpriced[0].reason).toBe("unreadable date");
    expect(JSON.stringify(p)).not.toContain("13/45/2021");
  });
});

describe("amounts are opt-in", () => {
  // Absolute rupee values are personal financial data, so they are withheld
  // unless the user explicitly asks to include them.
  it("sends no rupee amount by default", () => {
    const p = build();
    expect(p.amountsIncluded).toBe(false);
    expect(p.portfolio.invested).toBeUndefined();
    expect(p.portfolio.currentValue).toBeUndefined();
    expect(p.holdings[0].invested).toBeUndefined();
    const s = JSON.stringify(p);
    expect(s).not.toContain("198000");
    expect(s).not.toContain("79713");
  });

  it("still carries everything needed to explain the numbers", () => {
    const p = build();
    expect(p.portfolio.xirrPct).toBe(10.53);
    expect(p.holdings[0].absoluteReturnPct).toBe(59.43);
    expect(p.holdings[0].shareOfPortfolioPct).toBeCloseTo(27.44, 1);
    expect(p.holdings[0].sizeBand).toBe("large");
  });

  it("includes amounts only when explicitly asked", () => {
    const p = build({ includeAmounts: true });
    expect(p.amountsIncluded).toBe(true);
    expect(p.portfolio.invested).toBe(198000);
    expect(p.holdings[0].currentValue).toBe(79713.66);
  });
});

describe("payload content", () => {
  it("rounds figures so the model is not handed 12 decimal places", () => {
    expect(build().holdings[0].absoluteReturnPct).toBe(59.43);
  });
  it("states the caveats explicitly", () => {
    expect(build().caveats.expenseRatioAlreadyInNAV).toBe(true);
  });
  it("flags IDCW holdings, which NAV-only returns understate", () => {
    expect(build({ holdings: [holding({ option: "idcw" })] }).holdings[0].isIdcw).toBe(true);
    expect(build().holdings[0].isIdcw).toBe(false);
  });
  it("survives having no priced holdings at all", () => {
    const p = buildInsightsPayload({ holdings: [], summary: null, navDate: null });
    expect(p.portfolio).toBeNull();
    expect(p.holdings).toEqual([]);
  });
});

describe("describePayload", () => {
  // If this drifts from buildInsightsPayload the UI is lying about what it sends.
  it("says no rupee amount is sent when amounts are off", () => {
    const { sent, notSent } = describePayload(build());
    expect(notSent).toContain("Any rupee amount");
    expect(sent.join(" ")).not.toMatch(/rupee amounts/i);
  });
  it("declares amounts when they are included", () => {
    const { sent, notSent } = describePayload(build({ includeAmounts: true }));
    expect(sent.join(" ")).toMatch(/Rupee amounts/);
    expect(notSent).not.toContain("Any rupee amount");
  });
  it("always declares that identifiers are withheld", () => {
    const { notSent } = describePayload(build());
    expect(notSent).toContain("Folio numbers");
    expect(notSent.join(" ")).toMatch(/PAN/);
  });
});
