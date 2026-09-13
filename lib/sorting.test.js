import { describe, it, expect } from "vitest";
import {
  compareValues,
  sortItems,
  nextSortConfig,
  ariaSortFor,
  sortIndicator,
} from "./sorting.js";

describe("compareValues", () => {
  it("sorts numbers numerically, not as strings", () => {
    expect(compareValues(100, 9, "asc")).toBeGreaterThan(0);
    expect(compareValues("100", "9", "asc")).toBeGreaterThan(0);
  });

  it("reverses for descending", () => {
    expect(compareValues(1, 2, "asc")).toBeLessThan(0);
    expect(compareValues(1, 2, "desc")).toBeGreaterThan(0);
  });

  it("sorts dates chronologically", () => {
    const early = new Date(Date.UTC(2021, 0, 1));
    const late = new Date(Date.UTC(2026, 0, 1));
    expect(compareValues(early, late, "asc")).toBeLessThan(0);
    expect(compareValues(early, late, "desc")).toBeGreaterThan(0);
  });

  it("sorts text case-insensitively", () => {
    expect(compareValues("apple", "Banana", "asc")).toBeLessThan(0);
  });

  // A row with no NAV is unknown, not smallest. Flipping the sort must not
  // promote unpriced rows to the top.
  it("sinks missing values to the bottom in BOTH directions", () => {
    expect(compareValues(null, 5, "asc")).toBeGreaterThan(0);
    expect(compareValues(null, 5, "desc")).toBeGreaterThan(0);
    expect(compareValues(5, undefined, "asc")).toBeLessThan(0);
    expect(compareValues(5, undefined, "desc")).toBeLessThan(0);
    expect(compareValues("", 5, "asc")).toBeGreaterThan(0);
  });

  it("treats two missing values as equal", () => {
    expect(compareValues(null, undefined, "asc")).toBe(0);
  });
});

describe("sortItems", () => {
  const rows = [
    { name: "Midcap", value: 81002, cagr: null },
    { name: "Contra", value: 79713, cagr: 13.03 },
    { name: "Nifty", value: 79674, cagr: 6.06 },
  ];

  it("returns the input untouched when no column is selected", () => {
    expect(sortItems(rows, { key: "", direction: "asc" })).toBe(rows);
  });

  it("does not mutate the array it is given", () => {
    const copy = [...rows];
    sortItems(rows, { key: "value", direction: "asc" });
    expect(rows).toEqual(copy);
  });

  it("sorts ascending and descending", () => {
    expect(
      sortItems(rows, { key: "value", direction: "asc" }).map((r) => r.name)
    ).toEqual(["Nifty", "Contra", "Midcap"]);
    expect(
      sortItems(rows, { key: "value", direction: "desc" }).map((r) => r.name)
    ).toEqual(["Midcap", "Contra", "Nifty"]);
  });

  it("keeps a null-valued row last whichever way the sort goes", () => {
    expect(
      sortItems(rows, { key: "cagr", direction: "asc" }).map((r) => r.name)
    ).toEqual(["Nifty", "Contra", "Midcap"]);
    expect(
      sortItems(rows, { key: "cagr", direction: "desc" }).map((r) => r.name)
    ).toEqual(["Contra", "Nifty", "Midcap"]);
  });

  it("uses an accessor when the value is not a plain property", () => {
    const accessors = { initial: (r) => r.name[0] };
    expect(
      sortItems(rows, { key: "initial", direction: "asc" }, accessors).map(
        (r) => r.name
      )
    ).toEqual(["Contra", "Midcap", "Nifty"]);
  });
});

describe("nextSortConfig", () => {
  it("starts ascending on a new column", () => {
    expect(nextSortConfig({ key: "", direction: "" }, "value")).toEqual({
      key: "value",
      direction: "asc",
    });
  });

  it("flips to descending on the same column", () => {
    expect(nextSortConfig({ key: "value", direction: "asc" }, "value")).toEqual({
      key: "value",
      direction: "desc",
    });
  });

  it("returns to ascending on a third click", () => {
    expect(nextSortConfig({ key: "value", direction: "desc" }, "value")).toEqual({
      key: "value",
      direction: "asc",
    });
  });
});

describe("header affordances", () => {
  it("reports aria-sort only for the active column", () => {
    const config = { key: "value", direction: "asc" };
    expect(ariaSortFor(config, "value")).toBe("ascending");
    expect(ariaSortFor(config, "name")).toBe("none");
  });

  it("shows an arrow only on the active column", () => {
    const config = { key: "value", direction: "asc" };
    expect(sortIndicator(config, "value")).toBe(" ↑");
    expect(sortIndicator(config, "name")).toBe("");
  });
});
