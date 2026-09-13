import { describe, it, expect } from "vitest";
import {
  computeRow,
  parseRowDate,
  detectDateOrder,
  yearsBetween,
  xirr,
} from "./calculateUtils";

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

describe("computeRow", () => {
  // The case the old code got wrong three different ways: it reported
  // 17,434.92 on load and 11,486.98 after an edit, against a true 20,000.
  it("values a doubled holding at exactly twice the investment", () => {
    const row = computeRow({
      amount: 10000,
      startNAV: 50,
      endNAV: 100,
      purchaseDate: utc(2021, 9, 13),
      asOf: utc(2026, 9, 13),
    });

    expect(row.status).toBe("priced");
    expect(row.units).toBe(200);
    expect(row.currentValue).toBe(20000);
    expect(row.absoluteGain).toBe(10000);
    expect(row.absoluteReturn).toBe(100);
    // 13 Sep 2021 -> 13 Sep 2026 is 1826 days, which is 4.9993 years against a
    // 365.25-day year, not a flat 5.0 -- so the rate is fractionally above the
    // idealised 14.8698%. That precision is the point; don't "fix" it to 5.0.
    expect(row.years).toBeCloseTo(4.9993, 3);
    expect(row.cagr).toBeCloseTo(14.8720, 3);
  });

  it("annualises an exactly-5.0-year holding to the textbook rate", () => {
    const row = computeRow({
      amount: 10000,
      startNAV: 50,
      endNAV: 100,
      purchaseDate: new Date(0),
      asOf: new Date(5 * 365.25 * 24 * 60 * 60 * 1000),
    });
    expect(row.years).toBe(5);
    expect(row.cagr).toBeCloseTo(14.8698, 4);
  });

  it("never derives value from CAGR, so a long hold is not understated", () => {
    const row = computeRow({
      amount: 10000,
      startNAV: 50,
      endNAV: 100,
      purchaseDate: utc(2006, 1, 1),
      asOf: utc(2026, 1, 1),
    });
    // 20 years or 5, doubling is doubling.
    expect(row.currentValue).toBe(20000);
  });

  it("flags sub-1-year CAGR as an extrapolation rather than hiding it", () => {
    const row = computeRow({
      amount: 10000,
      startNAV: 100,
      endNAV: 105,
      purchaseDate: utc(2026, 9, 12),
      asOf: utc(2026, 9, 13),
    });

    // The figure is shown, but flagged as an extrapolation.
    expect(row.annualisedFromShortPeriod).toBe(true);
    expect(row.holdingDays).toBe(1);
    // The honest number is still available alongside it.
    expect(row.absoluteReturn).toBeCloseTo(5, 10);
    expect(row.currentValue).toBeCloseTo(10500, 10);
  });

  it("reports a loss as a negative gain rather than a blank", () => {
    const row = computeRow({
      amount: 10000,
      startNAV: 100,
      endNAV: 80,
      purchaseDate: utc(2020, 1, 1),
      asOf: utc(2026, 1, 1),
    });
    expect(row.absoluteGain).toBe(-2000);
    expect(row.cagr).toBeLessThan(0);
  });

  it("returns an explicit unpriced status, never a silent zero", () => {
    const missingNav = computeRow({
      amount: 10000,
      startNAV: 50,
      endNAV: NaN,
      purchaseDate: utc(2020, 1, 1),
    });
    expect(missingNav.status).toBe("unpriced");
    expect(missingNav.currentValue).toBeUndefined();

    // "Direct Plan" is what the broken parser was feeding in as a NAV.
    expect(
      computeRow({ amount: 10000, startNAV: 50, endNAV: "Direct Plan" }).status
    ).toBe("unpriced");

    expect(
      computeRow({ amount: 10000, startNAV: 0, endNAV: 100 }).status
    ).toBe("unpriced");
  });
});

describe("parseRowDate", () => {
  it("reads Indian DD/MM/YYYY by default", () => {
    expect(parseRowDate("03/07/2021")).toEqual(utc(2021, 7, 3));
  });

  it("honours an explicit MDY order", () => {
    expect(parseRowDate("03/07/2021", "MDY")).toEqual(utc(2021, 3, 7));
  });

  it("uses a component above 12 to override the stated order", () => {
    expect(parseRowDate("25/04/2023", "MDY")).toEqual(utc(2023, 4, 25));
  });

  it("reads ISO and AMFI's own format", () => {
    expect(parseRowDate("2021-07-03")).toEqual(utc(2021, 7, 3));
    expect(parseRowDate("11-Sep-2026")).toEqual(utc(2026, 9, 11));
  });

  // The old code let these through as Invalid Date, and .toISOString()
  // then threw during render, blanking the page.
  it("returns null for junk instead of an Invalid Date", () => {
    for (const bad of ["", "   ", "not a date", "32/13/2021", "99/99/9999", null, undefined]) {
      expect(parseRowDate(bad)).toBeNull();
    }
  });

  it("rejects impossible calendar dates", () => {
    expect(parseRowDate("31/02/2021")).toBeNull();
  });
});

describe("detectDateOrder", () => {
  it("infers DMY from a day above 12", () => {
    expect(detectDateOrder(["03/07/2021", "25/04/2023"])).toEqual({
      order: "DMY",
      confident: true,
    });
  });

  it("infers MDY when the second component exceeds 12", () => {
    expect(detectDateOrder(["07/25/2021", "03/04/2023"])).toEqual({
      order: "MDY",
      confident: true,
    });
  });

  it("flags an all-ambiguous column rather than guessing silently", () => {
    expect(detectDateOrder(["03/07/2021", "04/05/2023"]).confident).toBe(false);
  });
});

describe("yearsBetween", () => {
  it("accounts for leap years", () => {
    // 2020-2024 spans one leap day.
    expect(yearsBetween(utc(2020, 1, 1), utc(2024, 1, 1))).toBeCloseTo(4, 2);
  });

  it("returns null for an unparseable date", () => {
    expect(yearsBetween(null, utc(2026, 1, 1))).toBeNull();
  });
});

describe("xirr", () => {
  it("matches CAGR when there is a single lump sum", () => {
    const rate = xirr([
      { date: utc(2021, 9, 13), amount: -10000 },
      { date: utc(2026, 9, 13), amount: 20000 },
    ]);
    expect(rate).toBeCloseTo(14.87, 1);
  });

  it("solves irregular SIP-style cashflows", () => {
    const rate = xirr([
      { date: utc(2023, 1, 1), amount: -10000 },
      { date: utc(2023, 6, 1), amount: -10000 },
      { date: utc(2024, 1, 1), amount: -10000 },
      { date: utc(2026, 1, 1), amount: 38000 },
    ]);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(50);
  });

  it("returns null when every flow has the same sign", () => {
    expect(
      xirr([
        { date: utc(2023, 1, 1), amount: -10000 },
        { date: utc(2024, 1, 1), amount: -10000 },
      ])
    ).toBeNull();
  });
});
