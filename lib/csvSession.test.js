import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// csvSession caches its parse at module scope, so each test needs a fresh one.
const freshModule = async () => { vi.resetModules(); return import("./csvSession.js"); };
const makeStorage = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
};
const withWindow = (storage) => { globalThis.window = { sessionStorage: storage }; };

afterEach(() => { delete globalThis.window; vi.restoreAllMocks(); });

describe("server-side rendering", () => {
  beforeEach(() => { delete globalThis.window; });
  // The whole reason this module exists: sessionStorage does not exist while
  // Next pre-renders the sheet page on the server.
  it("returns an empty list instead of throwing when there is no window", async () => {
    const { loadRows } = await freshModule();
    expect(loadRows()).toEqual([]);
  });
  it("reports null as the server snapshot, distinct from an empty stash", async () => {
    const { getServerRowsSnapshot } = await freshModule();
    expect(getServerRowsSnapshot()).toBeNull();
  });
  it("saveRows reports failure rather than throwing during SSR", async () => {
    const { saveRows } = await freshModule();
    expect(saveRows([{ a: 1 }])).toBe(false);
  });
});

describe("round trip", () => {
  it("hands rows from the upload page to the sheet page", async () => {
    withWindow(makeStorage());
    const { saveRows, loadRows } = await freshModule();
    const rows = [{ SchemeName: "SBI Contra Fund", Amount: "10000" }];
    expect(saveRows(rows)).toBe(true);
    expect(loadRows()).toEqual(rows);
  });
  it("clearRows empties the stash", async () => {
    withWindow(makeStorage());
    const { saveRows, loadRows, clearRows } = await freshModule();
    saveRows([{ a: 1 }]); clearRows();
    expect(loadRows()).toEqual([]);
  });
});

describe("snapshot stability", () => {
  // useSyncExternalStore re-renders whenever the snapshot changes by
  // reference. A fresh array every call would loop forever.
  it("returns the identical array reference on repeated reads", async () => {
    withWindow(makeStorage());
    const { saveRows, loadRows } = await freshModule();
    saveRows([{ a: 1 }]);
    expect(loadRows()).toBe(loadRows());
  });
  it("returns a stable reference for the empty case too", async () => {
    withWindow(makeStorage());
    const { loadRows } = await freshModule();
    expect(loadRows()).toBe(loadRows());
  });
  it("produces a new reference once the stash actually changes", async () => {
    withWindow(makeStorage());
    const { saveRows, loadRows } = await freshModule();
    saveRows([{ a: 1 }]);
    const first = loadRows();
    saveRows([{ a: 2 }]);
    expect(loadRows()).not.toBe(first);
  });
});

describe("hostile storage", () => {
  it("survives corrupt JSON rather than crashing the sheet", async () => {
    withWindow(makeStorage({ "mf:rows": "{not json" }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { loadRows } = await freshModule();
    expect(loadRows()).toEqual([]);
  });
  it("ignores a stash that is valid JSON but not an array", async () => {
    withWindow(makeStorage({ "mf:rows": '{"rows":1}' }));
    const { loadRows } = await freshModule();
    expect(loadRows()).toEqual([]);
  });
  // Private browsing throws on setItem in some browsers.
  it("reports failure when storage refuses to write", async () => {
    withWindow({ getItem: () => null, setItem: () => { throw new Error("Quota"); }, removeItem: () => {} });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { saveRows } = await freshModule();
    expect(saveRows([{ a: 1 }])).toBe(false);
  });
  it("returns empty when storage refuses to read", async () => {
    withWindow({ getItem: () => { throw new Error("Security"); }, setItem: () => {}, removeItem: () => {} });
    const { loadRows } = await freshModule();
    expect(loadRows()).toEqual([]);
  });
});

describe("subscribeToRows", () => {
  it("returns an unsubscribe function", async () => {
    withWindow(makeStorage());
    const { subscribeToRows } = await freshModule();
    const un = subscribeToRows(() => {});
    expect(typeof un).toBe("function");
    expect(() => un()).not.toThrow();
  });
});
