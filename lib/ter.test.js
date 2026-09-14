import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolveTerColumns, parseTerSheet, lookupTer } from "./ter.js";
import * as calculateUtils from "./calculateUtils.js";

// Format 7E, as AMFI actually emits it.
const HEADER = [
  "NSDL Scheme Code", "Scheme Name", "Scheme Type", "Scheme Category", "TER Date",
  "Regular Plan - Base Expense Ratio (BER) (%)", "Regular Plan - Brokerage cost (%)",
  "Regular Plan - Transaction Cost incurred for the purpose of execution of trade (%)",
  "Regular Plan - Statutory Levies (including GST) (%)", "Regular Plan - Total TER (%)",
  "Direct Plan - Base Expense Ratio (BER) (%)", "Direct Plan - Brokerage cost (%)",
  "Direct Plan - Transaction Cost incurred for the purpose of execution of trade (%)",
  "Direct Plan - Statutory Levies (including GST) (%)", "Direct Plan - Total TER (%)",
];
const row = (name, serial, reg, dir, cat = "Equity") =>
  ["X/1", name, "Open Ended", cat, String(serial), "", "", "", "", String(reg), "", "", "", "", String(dir)];

describe("resolveTerColumns", () => {
  it("finds the columns by header name", () => {
    const c = resolveTerColumns(HEADER);
    expect(c.name).toBe(1);
    expect(c.date).toBe(4);
    expect(c.regular).toBe(9);
    expect(c.direct).toBe(14);
  });

  // AMFI renamed these fields at FY2026-27, the same way the NAV columns moved.
  it("survives the columns being reordered", () => {
    const reordered = ["Direct Plan - Total TER (%)", "TER Date", "Scheme Name", "Regular Plan - Total TER (%)"];
    const c = resolveTerColumns(reordered);
    expect(c.direct).toBe(0);
    expect(c.name).toBe(2);
  });

  it("throws loudly when a required column disappears", () => {
    expect(() => resolveTerColumns(["Scheme Name", "TER Date"]))
      .toThrow(/AMFI TER layout changed.*regular/s);
  });

  it("tolerates the optional category column being absent", () => {
    expect(resolveTerColumns([
      "Scheme Name", "TER Date", "Regular Plan - Total TER (%)", "Direct Plan - Total TER (%)",
    ]).category).toBe(-1);
  });
});

describe("parseTerSheet", () => {
  // Reporting lags: today is usually only partly filled in, so the best-covered
  // date is the right one, not the most recent.
  it("picks the best-covered date, not the newest", () => {
    const rows = [HEADER];
    for (let i = 0; i < 100; i += 1) rows.push(row(`Fund ${i}`, 46266, 1.5, 0.8));
    rows.push(row("Fund 0", 46270, 1.5, 0.8)); // newer, but only one scheme
    const index = parseTerSheet(rows);
    expect(index.terDate).toBe("2026-09-01");
    expect(index.schemeCount).toBe(100);
  });

  it("prefers the newest date among well-covered ones", () => {
    const rows = [HEADER];
    for (let i = 0; i < 100; i += 1) {
      rows.push(row(`Fund ${i}`, 46266, 1.5, 0.8));
      rows.push(row(`Fund ${i}`, 46267, 1.6, 0.9));
    }
    expect(parseTerSheet(rows).terDate).toBe("2026-09-02");
  });

  it("keys by the same normaliser the NAV matcher uses", () => {
    const index = parseTerSheet([HEADER, row("SBI CONTRA FUND", 46266, 1.6, 0.85)]);
    expect(index.byName.has("sbi contra fund")).toBe(true);
  });

  it("rejects implausible values rather than displaying them", () => {
    const index = parseTerSheet([
      HEADER,
      row("Good Fund", 46266, 1.6, 0.85),
      row("Bad Fund", 46266, 99, -1),
      row("Empty Fund", 46266, "", ""),
    ]);
    expect(index.byName.get("good fund").regular).toBe(1.6);
    expect(index.byName.has("bad fund")).toBe(false);
    expect(index.byName.has("empty fund")).toBe(false);
  });

  it("throws rather than serving an empty index", () => {
    expect(() => parseTerSheet([HEADER])).toThrow(/no dated rows/);
    expect(() => parseTerSheet([])).toThrow(/empty/);
  });
});

describe("lookupTer", () => {
  const index = parseTerSheet([
    HEADER,
    row("SBI CONTRA FUND", 46266, 1.6, 0.85),
    row("SBI MIDCAP FUND", 46266, 1.55, 0.72),
  ]);

  it("returns the right figure per plan", () => {
    expect(lookupTer(index, "sbi contra fund - direct plan - growth", "direct").ter).toBe(0.85);
    expect(lookupTer(index, "sbi contra fund - regular plan - growth", "regular").ter).toBe(1.6);
  });

  it("exposes both plans so the saving can be shown", () => {
    const hit = lookupTer(index, "SBI CONTRA FUND", "direct");
    expect(hit.regular - hit.direct).toBeCloseTo(0.75, 10);
  });

  it("carries the date, so a stale figure is visible not silent", () => {
    expect(lookupTer(index, "SBI CONTRA FUND", "direct").date).toBe("2026-09-01");
  });

  it("returns null rather than guessing", () => {
    expect(lookupTer(index, "Unknown Fund", "direct")).toBeNull();
    expect(lookupTer(index, "SBI CONTRA FUND", null)).toBeNull();
    expect(lookupTer(null, "SBI CONTRA FUND", "direct")).toBeNull();
  });
});

// The load-bearing correctness guard. NAV is already net of TER (SEBI Master
// Circular 9.2.3), so subtracting it from a return would double-count it.
describe("TER never reaches the maths", () => {
  it("calculateUtils does not import the TER module", () => {
    const source = readFileSync(new URL("./calculateUtils.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'].*ter(\.js)?["']/);
    expect(source.toLowerCase()).not.toContain("expense");
  });

  it("calculateUtils exports nothing that accepts a TER argument", () => {
    for (const [name, fn] of Object.entries(calculateUtils)) {
      if (typeof fn !== "function") continue;
      expect(fn.toString().toLowerCase()).not.toContain("ter:");
      expect(name.toLowerCase()).not.toContain("expense");
    }
  });

  it("computeRow ignores a TER passed in, so it cannot leak into a return", () => {
    const base = { amount: 10000, startNAV: 50, endNAV: 100, purchaseDate: new Date(Date.UTC(2021, 8, 13)), asOf: new Date(Date.UTC(2026, 8, 13)) };
    const withTer = calculateUtils.computeRow({ ...base, ter: 1.6, expenseRatio: 1.6 });
    const without = calculateUtils.computeRow(base);
    expect(withTer.currentValue).toBe(without.currentValue);
    expect(withTer.cagr).toBe(without.cagr);
  });
});

// Runs only when the fixture is present, so CI without network still passes.
const FIXTURE = "/tmp/claude-1000/-home-kingsuk-Documents-workspace-SBI-MF-CAGR-Calculator/edd8477b-d4b6-4e34-8078-c0b54a76c41d/scratchpad/ter.xlsx";
describe.skipIf(!existsSync(FIXTURE))("against the real AMFI file", () => {
  it("parses it and finds a known scheme", async () => {
    const { readSheetRows } = await import("./xlsx.js");
    const index = parseTerSheet(readSheetRows(readFileSync(FIXTURE)));
    expect(index.byName.size).toBeGreaterThan(1500);
    expect(index.terDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const hit = lookupTer(index, "SBI CONTRA FUND", "direct");
    expect(hit.ter).toBeGreaterThan(0);
    expect(hit.ter).toBeLessThan(hit.regular);
  });
});
