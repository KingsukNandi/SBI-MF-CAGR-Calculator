import { describe, it, expect } from "vitest";
import { groupHoldings, summariseHoldings, groupKey } from "./grouping.js";
import { computeRow, xirr } from "./calculateUtils.js";

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const AS_OF = utc(2026, 9, 14);

const lot = ({ folio = "F1", scheme = "SBI Contra Fund", matched = "SBI CONTRA FUND", amount, startNAV, endNAV = 100, date }) => ({
  id: `${folio}-${date.toISOString()}-${amount}`,
  folioNo: folio, schemeName: scheme, matchedScheme: matched,
  amount: String(amount), purchaseNAV: String(startNAV), currentNAV: String(endNAV), date,
  ...computeRow({ amount, startNAV, endNAV, purchaseDate: date, asOf: AS_OF }),
});

describe("groupKey", () => {
  it("puts two spellings of one fund in the same holding", () => {
    expect(groupKey({ folioNo: "F1", schemeName: "SBI Contra Fund - Direct Plan - Growth", matchedScheme: "SBI CONTRA FUND" }))
      .toBe(groupKey({ folioNo: "F1", schemeName: "sbi contra fund-direct-growth", matchedScheme: "SBI CONTRA FUND" }));
  });
  it("keeps the same fund in different folios apart", () => {
    expect(groupKey({ folioNo: "F1", matchedScheme: "X" })).not.toBe(groupKey({ folioNo: "F2", matchedScheme: "X" }));
  });
});

describe("groupHoldings", () => {
  it("sums lots of the same holding", () => {
    const [h] = groupHoldings([
      lot({ amount: 10000, startNAV: 50, endNAV: 100, date: utc(2021, 9, 14) }),
      lot({ amount: 15000, startNAV: 75, endNAV: 100, date: utc(2023, 9, 14) }),
    ], AS_OF);
    expect(h.lotCount).toBe(2);
    expect(h.invested).toBe(25000);
    expect(h.units).toBe(400);
    expect(h.currentValue).toBe(40000);
  });

  it("uses weighted-average cost, not the mean of the lots' NAVs", () => {
    const [h] = groupHoldings([
      lot({ amount: 90000, startNAV: 90, endNAV: 100, date: utc(2024, 9, 14) }),
      lot({ amount: 1000, startNAV: 10, endNAV: 100, date: utc(2024, 9, 14) }),
    ], AS_OF);
    // The naive mean of 90 and 10 would be 50, wrong by 65%.
    expect(h.averageNAV).toBeCloseTo(91000 / 1100, 6);
    expect(h.averageNAV).not.toBeCloseTo(50, 0);
  });

  // The invariant that forced the 365-day year: one lot is a lump sum, so its
  // holding XIRR and its row CAGR are the same quantity.
  it("a single-lot holding's XIRR equals that lot's CAGR", () => {
    const only = lot({ amount: 10000, startNAV: 50, endNAV: 100, date: utc(2021, 9, 14) });
    const [h] = groupHoldings([only], AS_OF);
    expect(h.xirr).toBeCloseTo(only.cagr, 4);
  });

  it("does not average the lots' CAGRs", () => {
    const rows = [
      lot({ amount: 10000, startNAV: 50, endNAV: 100, date: utc(2016, 9, 14) }),
      lot({ amount: 10000, startNAV: 90, endNAV: 100, date: utc(2025, 9, 14) }),
    ];
    const [h] = groupHoldings(rows, AS_OF);
    expect(h.xirr).not.toBeCloseTo((rows[0].cagr + rows[1].cagr) / 2, 1);
    expect(h.xirr).toBeGreaterThan(Math.min(rows[0].cagr, rows[1].cagr));
    expect(h.xirr).toBeLessThan(Math.max(rows[0].cagr, rows[1].cagr));
  });

  it("excludes unpriced lots from the totals but still counts them", () => {
    const [h] = groupHoldings([
      lot({ amount: 10000, startNAV: 50, endNAV: 100, date: utc(2021, 9, 14) }),
      { ...lot({ amount: 99999, startNAV: 50, endNAV: 100, date: utc(2021, 9, 14) }), status: "unpriced", reason: "Current NAV unavailable" },
    ], AS_OF);
    expect(h.lotCount).toBe(2);
    expect(h.unpricedCount).toBe(1);
    expect(h.invested).toBe(10000);
    expect(h.currentValue).toBe(20000);
  });

  it("marks a holding unpriced when no lot could be priced", () => {
    const [h] = groupHoldings([
      { ...lot({ amount: 10000, startNAV: 50, date: utc(2021, 9, 14) }), status: "unpriced", reason: "Current NAV unavailable" },
    ], AS_OF);
    expect(h.status).toBe("unpriced");
    expect(h.invested).toBeUndefined();
  });

  it("dates the holding from its earliest lot", () => {
    const [h] = groupHoldings([
      lot({ amount: 10000, startNAV: 50, endNAV: 100, date: utc(2024, 9, 14) }),
      lot({ amount: 10000, startNAV: 50, endNAV: 100, date: utc(2021, 9, 14) }),
    ], AS_OF);
    expect(h.firstPurchase).toEqual(utc(2021, 9, 14));
  });

  it("orders by current value, sinking unpriced holdings", () => {
    const holdings = groupHoldings([
      lot({ folio: "F1", amount: 1000, startNAV: 50, endNAV: 100, date: utc(2021, 9, 14) }),
      lot({ folio: "F2", matched: "SBI MIDCAP FUND", amount: 50000, startNAV: 50, endNAV: 100, date: utc(2021, 9, 14) }),
      { ...lot({ folio: "F3", matched: "SBI DEAD FUND", amount: 9000, startNAV: 50, date: utc(2021, 9, 14) }), status: "unpriced", reason: "x" },
    ], AS_OF);
    expect(holdings.map((h) => h.folioNo)).toEqual(["F2", "F1", "F3"]);
  });
});

describe("summariseHoldings", () => {
  it("totals agree with a flat XIRR over the same cashflows", () => {
    const rows = [
      lot({ folio: "F1", amount: 10000, startNAV: 50, endNAV: 100, date: utc(2021, 9, 14) }),
      lot({ folio: "F1", amount: 15000, startNAV: 75, endNAV: 100, date: utc(2023, 9, 14) }),
      lot({ folio: "F2", matched: "SBI MIDCAP FUND", amount: 20000, startNAV: 80, endNAV: 100, date: utc(2022, 9, 14) }),
    ];
    const summary = summariseHoldings(groupHoldings(rows, AS_OF), AS_OF);
    expect(summary.holdingCount).toBe(2);
    expect(summary.invested).toBe(45000);
    // Grouping must not change the portfolio answer.
    const flat = rows.map((r) => ({ date: r.date, amount: -Number(r.amount) }));
    flat.push({ date: AS_OF, amount: summary.currentValue });
    expect(summary.xirr).toBeCloseTo(xirr(flat), 6);
  });
  it("returns null when nothing could be priced", () => {
    const rows = [{ ...lot({ amount: 1, startNAV: 1, date: utc(2021, 1, 1) }), status: "unpriced" }];
    expect(summariseHoldings(groupHoldings(rows, AS_OF), AS_OF)).toBeNull();
  });
});
