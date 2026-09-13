import { describe, it, expect } from "vitest";
import { resolveColumns, normalizeName, parseQuery, parseSnapshot, lookup } from "./amfi.js";

// The live 8-column layout, as fetched 13 Sep 2026.
const HEADER = "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date";
const FEED = [
  HEADER, "", "Open Ended Schemes(Equity Scheme - Contra Fund)", "", "SBI Mutual Fund", "",
  "119835;INF200K01RA0;-;SBI CONTRA FUND;Direct Plan;Growth;408.9709;11-Sep-2026",
  "103504;INF200K01156;INF200K01164;SBI CONTRA FUND;Regular Plan;IDCW;64.3577;11-Sep-2026",
  "119836;INF200K01RB8;-;SBI CONTRA FUND;Regular Plan;Growth;371.2264;11-Sep-2026",
  "119716;INF200K01TP4;-;SBI MIDCAP FUND;Direct Plan;Growth;270.1489;11-Sep-2026",
  "153320;INF200KB1621;-;SBI Nifty IT Index Fund;Direct Plan;Growth;7.3250;11-Sep-2026",
].join("\n");

describe("resolveColumns", () => {
  it("locates every column by header name, not position", () => {
    expect(resolveColumns(HEADER)).toEqual({
      code: 0, isinGrowth: 1, isinReinvest: 2, name: 3,
      plan: 4, option: 5, nav: 6, date: 7,
    });
  });
  // The bug that broke production: AMFI inserted Plan and Option, moving NAV
  // from 4 to 6, and the positional parser read "Direct Plan" as the NAV for
  // all 14,362 rows while still returning HTTP 200.
  it("survives columns being inserted before NAV", () => {
    const reordered = "Date;Net Asset Value;Option;Plan;Scheme Name;ISIN Div Reinvestment;ISIN Div Payout/ ISIN Growth;Scheme Code";
    const c = resolveColumns(reordered);
    expect(c.nav).toBe(1);
    expect(c.date).toBe(0);
    expect(c.name).toBe(4);
  });
  it("throws loudly when a load-bearing column disappears", () => {
    expect(() => resolveColumns("Scheme Code;Scheme Name;Plan;Option;Date")).toThrow(/AMFI layout changed/);
  });
  it("tolerates the ISIN columns being absent", () => {
    const c = resolveColumns("Scheme Code;Scheme Name;Plan;Option;Net Asset Value;Date");
    expect(c.isinGrowth).toBe(-1);
    expect(c.nav).toBe(4);
  });
});

describe("normalizeName", () => {
  it("collapses an AMFI name and a CAS-style name to the same key", () => {
    expect(normalizeName("SBI CONTRA FUND")).toBe("sbi contra fund");
    expect(normalizeName("sbi contra fund - direct plan - growth")).toBe("sbi contra fund");
  });
  it("collapses the double space seen in real CSV exports", () => {
    expect(normalizeName("sbi  nifty index fund - direct plan - growth")).toBe("sbi nifty index fund");
  });
});

describe("parseQuery", () => {
  it("reads plan and option out of a display name", () => {
    expect(parseQuery("sbi contra fund - direct plan - growth")).toEqual({
      name: "sbi contra fund", plan: "direct", option: "growth",
    });
  });
  it("recognises IDCW in both its spellings", () => {
    expect(parseQuery("sbi contra fund regular idcw").option).toBe("idcw");
    expect(parseQuery("sbi contra fund regular income distribution cum capital withdrawal").option).toBe("idcw");
  });
  it("leaves plan and option null when unstated", () => {
    expect(parseQuery("sbi contra fund")).toEqual({ name: "sbi contra fund", plan: null, option: null });
  });
});

describe("parseSnapshot", () => {
  const index = parseSnapshot(FEED);
  it("reads NAV and date from their real columns", () => {
    const [s] = index.byName.get("sbi midcap fund");
    expect(s.nav).toBe("270.1489");
    expect(s.date).toBe("11-Sep-2026");
    expect(s.nav).not.toBe("Direct Plan");
  });
  it("reads plan and option from their own columns", () => {
    const contra = index.byName.get("sbi contra fund");
    expect(contra).toHaveLength(3);
    expect(contra.every((s) => s.plan !== null)).toBe(true);
  });
  it("indexes by scheme code and ISIN", () => {
    expect(index.byCode.get("119835").nav).toBe("408.9709");
    expect(index.byIsin.get("INF200K01RA0").name).toBe("SBI CONTRA FUND");
    expect(index.byIsin.get("INF200K01164").plan).toBe("regular");
  });
  it("skips section headers and blank lines", () => {
    expect([...index.byName.values()].flat()).toHaveLength(5);
  });
  it("exposes the feed's NAV date", () => {
    expect(index.navDate).toBe("11-Sep-2026");
  });
  it("refuses to return an empty index rather than serving garbage", () => {
    expect(() => parseSnapshot(`${HEADER}\n\n\n`)).toThrow(/zero schemes/);
  });
  it("drops rows whose NAV is not a positive number", () => {
    const junk = [HEADER,
      "1;-;-;Junk A;Direct Plan;Growth;N.A.;11-Sep-2026",
      "2;-;-;Junk B;Direct Plan;Growth;0;11-Sep-2026",
      "3;-;-;Real Fund;Direct Plan;Growth;10.5;11-Sep-2026"].join("\n");
    expect([...parseSnapshot(junk).byName.values()].flat()).toHaveLength(1);
  });
});

describe("lookup", () => {
  const index = parseSnapshot(FEED);
  // Before the fix every one of these returned 404.
  it("matches a fully-qualified CAS-style name", () => {
    const { match, confidence } = lookup(index, "sbi contra fund - direct plan - growth");
    expect(confidence).toBe("exact");
    expect(match.nav).toBe("408.9709");
  });
  it("distinguishes plan and option rather than taking the first hit", () => {
    expect(lookup(index, "sbi contra fund - regular plan - growth").match.nav).toBe("371.2264");
    expect(lookup(index, "sbi contra fund - regular plan - idcw").match.nav).toBe("64.3577");
  });
  // The old code did matches[0], silently returning one of three NAVs that
  // differ by a factor of six.
  it("refuses to guess when plan and option are unstated", () => {
    const r = lookup(index, "sbi contra fund");
    expect(r.match).toBeNull();
    expect(r.confidence).toBe("ambiguous");
    expect(r.candidates).toHaveLength(3);
  });
  it("reports a genuine miss as none, not as a wrong match", () => {
    const r = lookup(index, "sbi bluechip fund - direct plan - growth");
    expect(r.match).toBeNull();
    expect(r.confidence).toBe("none");
  });
});
