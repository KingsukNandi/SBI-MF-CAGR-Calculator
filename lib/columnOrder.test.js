import { describe, it, expect, afterEach, vi } from "vitest";
import {
  reconcileOrder,
  moveColumn,
  loadOrder,
  saveOrder,
  clearOrder,
  isCustomised,
} from "./columnOrder.js";

const cols = (...keys) => keys.map((key) => ({ key, label: key }));
const keysOf = (columns) => columns.map((c) => c.key);

const makeStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
};
const withWindow = (storage) => {
  globalThis.window = { localStorage: storage };
};

afterEach(() => {
  delete globalThis.window;
  vi.restoreAllMocks();
});

describe("moveColumn", () => {
  const base = cols("a", "b", "c", "d");

  it("moves a column left to right", () => {
    expect(keysOf(moveColumn(base, 0, 2))).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a column right to left", () => {
    expect(keysOf(moveColumn(base, 3, 1))).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a column to the very end", () => {
    expect(keysOf(moveColumn(base, 0, 3))).toEqual(["b", "c", "d", "a"]);
  });

  it("does not mutate the array it is given", () => {
    const copy = [...base];
    moveColumn(base, 0, 2);
    expect(base).toEqual(copy);
  });

  it("is a no-op when the source and target are the same", () => {
    expect(moveColumn(base, 1, 1)).toBe(base);
  });

  it("is a no-op for out-of-range indices", () => {
    expect(moveColumn(base, -1, 2)).toBe(base);
    expect(moveColumn(base, 0, 99)).toBe(base);
  });

  it("keeps every column, never dropping or duplicating one", () => {
    const moved = moveColumn(base, 2, 0);
    expect(moved).toHaveLength(base.length);
    expect(new Set(keysOf(moved)).size).toBe(base.length);
  });
});

describe("reconcileOrder", () => {
  const current = cols("scheme", "units", "value", "xirr");

  it("applies a stored order", () => {
    expect(keysOf(reconcileOrder(["xirr", "scheme", "value", "units"], current)))
      .toEqual(["xirr", "scheme", "value", "units"]);
  });

  it("falls back to the code order when nothing is stored", () => {
    expect(keysOf(reconcileOrder(null, current))).toEqual(keysOf(current));
    expect(keysOf(reconcileOrder([], current))).toEqual(keysOf(current));
  });

  // Shipping a new column must not hide it from someone with a saved layout.
  it("appends columns the stored order has never seen", () => {
    const stored = ["value", "scheme"];
    expect(keysOf(reconcileOrder(stored, current))).toEqual([
      "value", "scheme", "units", "xirr",
    ]);
  });

  it("drops stored keys for columns that no longer exist", () => {
    const stored = ["xirr", "removedColumn", "scheme"];
    const result = keysOf(reconcileOrder(stored, current));
    expect(result).not.toContain("removedColumn");
    expect(result).toEqual(["xirr", "scheme", "units", "value"]);
  });

  it("ignores a duplicated key rather than rendering it twice", () => {
    const result = reconcileOrder(["scheme", "scheme", "units"], current);
    expect(result).toHaveLength(current.length);
    expect(new Set(keysOf(result)).size).toBe(current.length);
  });

  it("survives a stored value that is not an array", () => {
    expect(keysOf(reconcileOrder("nonsense", current))).toEqual(keysOf(current));
    expect(keysOf(reconcileOrder({ a: 1 }, current))).toEqual(keysOf(current));
  });

  it("always returns every current column exactly once", () => {
    for (const stored of [null, [], ["xirr"], ["a", "b"], ["units", "units"]]) {
      const result = reconcileOrder(stored, current);
      expect(new Set(keysOf(result))).toEqual(new Set(keysOf(current)));
    }
  });
});

describe("persistence", () => {
  it("round-trips an order", () => {
    withWindow(makeStorage());
    const order = cols("xirr", "scheme");
    expect(saveOrder("holdings", order)).toBe(true);
    expect(loadOrder("holdings")).toEqual(["xirr", "scheme"]);
  });

  // Each table keeps its own layout.
  it("keeps tables separate", () => {
    withWindow(makeStorage());
    saveOrder("holdings", cols("a", "b"));
    saveOrder("transactions", cols("x", "y"));
    expect(loadOrder("holdings")).toEqual(["a", "b"]);
    expect(loadOrder("transactions")).toEqual(["x", "y"]);
  });

  it("stores keys, not indices, so code changes cannot scramble it", () => {
    const storage = makeStorage();
    withWindow(storage);
    saveOrder("holdings", cols("xirr", "scheme"));
    expect(storage._store.get("mf:cols:holdings")).toBe('["xirr","scheme"]');
  });

  it("clearOrder removes the entry", () => {
    withWindow(makeStorage());
    saveOrder("holdings", cols("a"));
    clearOrder("holdings");
    expect(loadOrder("holdings")).toBeNull();
  });

  it("returns null when nothing is stored", () => {
    withWindow(makeStorage());
    expect(loadOrder("never-saved")).toBeNull();
  });

  // localStorage does not exist while Next pre-renders on the server.
  it("no-ops during SSR instead of throwing", () => {
    delete globalThis.window;
    expect(loadOrder("holdings")).toBeNull();
    expect(saveOrder("holdings", cols("a"))).toBe(false);
    expect(() => clearOrder("holdings")).not.toThrow();
  });

  it("falls back to the default order on corrupt JSON", () => {
    withWindow(makeStorage({ "mf:cols:holdings": "{not json" }));
    expect(loadOrder("holdings")).toBeNull();
  });

  it("ignores a stored array containing non-strings", () => {
    withWindow(makeStorage({ "mf:cols:holdings": '["a",3,null,"b"]' }));
    expect(loadOrder("holdings")).toEqual(["a", "b"]);
  });

  it("reports failure when storage refuses to write", () => {
    withWindow({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {},
    });
    expect(saveOrder("holdings", cols("a"))).toBe(false);
  });
});

describe("isCustomised", () => {
  const defaults = cols("a", "b", "c");

  it("is false for the untouched default order", () => {
    expect(isCustomised(cols("a", "b", "c"), defaults)).toBe(false);
  });

  it("is true once anything has moved", () => {
    expect(isCustomised(cols("b", "a", "c"), defaults)).toBe(true);
  });
});

describe("external store", () => {
  it("notifies subscribers when the order changes", async () => {
    withWindow(makeStorage());
    const { subscribeToOrder, setOrder, __resetStoreForTests } = await import("./columnOrder.js");
    __resetStoreForTests();

    let calls = 0;
    const unsubscribe = subscribeToOrder("t1")(() => { calls += 1; });
    setOrder("t1", cols("b", "a"));
    expect(calls).toBe(1);

    unsubscribe();
    setOrder("t1", cols("a", "b"));
    expect(calls).toBe(1);
  });

  // useSyncExternalStore compares by reference; a fresh array each call loops.
  it("returns a referentially stable snapshot", async () => {
    withWindow(makeStorage());
    const { getOrderSnapshot, __resetStoreForTests } = await import("./columnOrder.js");
    __resetStoreForTests();
    expect(getOrderSnapshot("t2")).toBe(getOrderSnapshot("t2"));
  });

  it("gives a new snapshot only after an actual change", async () => {
    withWindow(makeStorage());
    const { getOrderSnapshot, setOrder, __resetStoreForTests } = await import("./columnOrder.js");
    __resetStoreForTests();
    const before = getOrderSnapshot("t3");
    setOrder("t3", cols("z", "y"));
    const after = getOrderSnapshot("t3");
    expect(after).not.toBe(before);
    expect(after).toEqual(["z", "y"]);
  });

  it("reports null on the server, matching an unstored client", async () => {
    const { getServerOrderSnapshot } = await import("./columnOrder.js");
    expect(getServerOrderSnapshot()).toBeNull();
  });

  // All the lot tables share one id, so one drag must move all of them.
  it("keeps every subscriber of a shared id in step", async () => {
    withWindow(makeStorage());
    const { subscribeToOrder, setOrder, getOrderSnapshot, __resetStoreForTests } =
      await import("./columnOrder.js");
    __resetStoreForTests();

    const seen = [];
    subscribeToOrder("lots")(() => seen.push(getOrderSnapshot("lots")));
    subscribeToOrder("lots")(() => seen.push(getOrderSnapshot("lots")));
    setOrder("lots", cols("cagr", "date"));

    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(["cagr", "date"]);
    expect(seen[0]).toBe(seen[1]);
  });

  it("resetOrder clears storage and notifies", async () => {
    withWindow(makeStorage());
    const { setOrder, resetOrder, getOrderSnapshot, loadOrder: load, __resetStoreForTests } =
      await import("./columnOrder.js");
    __resetStoreForTests();

    setOrder("t4", cols("b", "a"));
    let notified = 0;
    (await import("./columnOrder.js")).subscribeToOrder("t4")(() => { notified += 1; });
    resetOrder("t4");

    expect(notified).toBe(1);
    expect(getOrderSnapshot("t4")).toBeNull();
    expect(load("t4")).toBeNull();
  });
});
