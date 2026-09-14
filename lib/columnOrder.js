/**
 * Column order persistence.
 *
 * Each table stores its own order under its own key, so reordering the
 * holdings table does not disturb the transactions table or the lot lists.
 *
 * The stored value is an array of column KEYS, never indices. Indices would
 * silently scramble the layout the moment a column is added, removed or
 * renamed in the code; keys degrade gracefully instead, and the reconcile step
 * below handles both directions of drift.
 */

const PREFIX = "mf:cols:";
const WIDTH_PREFIX = "mf:colw:";
const HIDDEN_PREFIX = "mf:colh:";

// Below this a heading is unreadable; above it one column can push every other
// off screen. Resizing is a convenience, not a licence to break the layout.
export const MIN_COLUMN_WIDTH = 60;
export const MAX_COLUMN_WIDTH = 600;

const hasStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

/**
 * Merge a stored order with the columns the code currently defines.
 *
 * - keys the user ordered that still exist keep their position
 * - keys that no longer exist are dropped
 * - NEW columns the user has never seen are appended, so shipping a column
 *   never hides it from someone with a saved layout
 */
export const reconcileOrder = (storedKeys, columns) => {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const seen = new Set();
  const ordered = [];

  for (const key of Array.isArray(storedKeys) ? storedKeys : []) {
    if (byKey.has(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(byKey.get(key));
    }
  }
  for (const column of columns) {
    if (!seen.has(column.key)) ordered.push(column);
  }
  return ordered;
};

/** Move the column at `from` so it sits at `to`, returning a new array. */
export const moveColumn = (columns, from, to) => {
  if (
    !Array.isArray(columns) ||
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= columns.length ||
    to >= columns.length
  ) {
    return columns;
  }
  const next = [...columns];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export const loadOrder = (tableId) => {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + tableId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : null;
  } catch {
    // Corrupt entry, private browsing, quota. Fall back to the default order
    // rather than breaking the table.
    return null;
  }
};

export const saveOrder = (tableId, columns) => {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(
      PREFIX + tableId,
      JSON.stringify(columns.map((c) => c.key))
    );
    return true;
  } catch {
    return false;
  }
};

export const clearOrder = (tableId) => {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(PREFIX + tableId);
  } catch {
    // Nothing useful to do.
  }
};

/**
 * Column widths, as a { [key]: px } map. Keyed like the order is, so a renamed
 * or removed column simply stops having a stored width.
 */
export const loadWidths = (tableId) => {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(WIDTH_PREFIX + tableId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const clean = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        clean[key] = clampWidth(value);
      }
    }
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
};

export const clampWidth = (px) =>
  Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(px)));

export const saveWidths = (tableId, widths) => {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(WIDTH_PREFIX + tableId, JSON.stringify(widths));
    return true;
  } catch {
    return false;
  }
};

/** Hidden column keys. Stored as the hidden set rather than the visible one, so
 * a newly shipped column defaults to visible. */
export const loadHidden = (tableId) => {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(HIDDEN_PREFIX + tableId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : null;
  } catch {
    return null;
  }
};

export const saveHidden = (tableId, keys) => {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(HIDDEN_PREFIX + tableId, JSON.stringify([...keys]));
    return true;
  } catch {
    return false;
  }
};

/** True when the user has moved anything away from the code's default order. */
export const isCustomised = (columns, defaults) =>
  columns.length !== defaults.length ||
  columns.some((c, i) => c.key !== defaults[i].key);

// -- External store -------------------------------------------------------
//
// Column order is read with useSyncExternalStore rather than an effect. That
// gives the stored order on the first client render (no flash, no cascading
// re-render), returns null during SSR so server and client markup agree, and
// keeps every table sharing a tableId in sync: the lot tables inside each
// expanded holding all read the same "lots" entry, so reordering one reorders
// them all.

const listeners = new Map(); // tableId -> Set<fn>
const snapshots = new Map(); // tableId -> { keys, widths, hidden }  (cached for referential equality)

const listenersFor = (tableId) => {
  if (!listeners.has(tableId)) listeners.set(tableId, new Set());
  return listeners.get(tableId);
};

export const subscribeToOrder = (tableId) => (onChange) => {
  const set = listenersFor(tableId);
  set.add(onChange);
  return () => set.delete(onChange);
};

/**
 * Cached so repeated calls return the identical array reference.
 * useSyncExternalStore compares snapshots by reference; a fresh array every
 * call would loop forever.
 */
export const getOrderSnapshot = (tableId) => {
  if (!snapshots.has(tableId)) {
    snapshots.set(tableId, {
      keys: loadOrder(tableId),
      widths: loadWidths(tableId) ?? {},
      hidden: loadHidden(tableId) ?? [],
    });
  }
  return snapshots.get(tableId);
};

/** `null` means "not known yet", which is what the server always reports. */
export const getServerOrderSnapshot = () => null;

const notify = (tableId) => listenersFor(tableId).forEach((fn) => fn());

export const setOrder = (tableId, columns) => {
  const current = getOrderSnapshot(tableId);
  snapshots.set(tableId, { ...current, keys: columns.map((c) => c.key) });
  saveOrder(tableId, columns);
  notify(tableId);
};

export const setWidth = (tableId, key, px) => {
  const current = getOrderSnapshot(tableId);
  const widths = { ...current.widths, [key]: clampWidth(px) };
  snapshots.set(tableId, { ...current, widths });
  saveWidths(tableId, widths);
  notify(tableId);
};

export const setHidden = (tableId, keys) => {
  const current = getOrderSnapshot(tableId);
  const hidden = [...new Set(keys)];
  snapshots.set(tableId, { ...current, hidden });
  saveHidden(tableId, hidden);
  notify(tableId);
};

/** Clears order, widths and visibility together: one visible control, one
 * predictable outcome. */
export const resetOrder = (tableId) => {
  snapshots.set(tableId, { keys: null, widths: {}, hidden: [] });
  clearOrder(tableId);
  if (hasStorage()) {
    try {
      window.localStorage.removeItem(WIDTH_PREFIX + tableId);
      window.localStorage.removeItem(HIDDEN_PREFIX + tableId);
    } catch {
      // Nothing useful to do.
    }
  }
  notify(tableId);
};

/** Test seam: drops cached snapshots and subscribers. */
export const __resetStoreForTests = () => {
  listeners.clear();
  snapshots.clear();
};
