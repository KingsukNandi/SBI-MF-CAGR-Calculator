/**
 * Hands parsed CSV rows from the upload page to the sheet page.
 *
 * React Router carried this in `location.state`, which Next.js has no
 * equivalent for. sessionStorage is the closer fit and is strictly better in
 * one respect: a page refresh no longer wipes the table, which it did before.
 *
 * The data stays in the user's own browser, is scoped to the tab, and is
 * cleared when that tab closes. Folio numbers and amounts never reach the
 * server — the only thing sent to the API is scheme names.
 */
const KEY = "mf:rows";

/** True only in the browser. Every function below no-ops during SSR. */
const hasStorage = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

export const saveRows = (rows) => {
  if (!hasStorage()) return false;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(rows));
    return true;
  } catch (err) {
    // Private browsing and quota limits both land here. Better to fail the
    // handoff loudly than to navigate to an empty sheet.
    console.error("Could not stash rows for the sheet page:", err);
    return false;
  }
};

const EMPTY = Object.freeze([]);

// useSyncExternalStore compares snapshots by reference and re-renders on any
// change, so the parse result must be cached — returning a fresh array each
// call would loop forever.
let cachedRaw;
let cachedRows = EMPTY;

/**
 * Returns the stashed rows, or [] when there are none.
 * Safe to call during render; returns [] rather than throwing during SSR.
 */
export const loadRows = () => {
  if (!hasStorage()) return EMPTY;
  let raw;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }

  if (raw === cachedRaw) return cachedRows;
  cachedRaw = raw;

  if (!raw) {
    cachedRows = EMPTY;
    return cachedRows;
  }

  try {
    const parsed = JSON.parse(raw);
    cachedRows = Array.isArray(parsed) ? parsed : EMPTY;
  } catch (err) {
    console.error("Stashed rows were unreadable, ignoring them:", err);
    cachedRows = EMPTY;
  }
  return cachedRows;
};

/**
 * Store contract for useSyncExternalStore. The stash is written once by the
 * upload page and never mutates while the sheet is open, so there is nothing
 * to subscribe to — but React requires the callback.
 */
export const subscribeToRows = () => () => {};

/**
 * Server snapshot. `null` means "not known yet" and is deliberately distinct
 * from [] ("looked, found nothing") so the sheet can tell hydrating apart from
 * genuinely empty and avoid flashing its empty state during SSR.
 */
export const getServerRowsSnapshot = () => null;

export const clearRows = () => {
  if (!hasStorage()) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing useful to do; the tab closing will clear it anyway.
  }
};
