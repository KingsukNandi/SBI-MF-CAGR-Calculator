/**
 * Shared column sorting.
 *
 * Used by three independent tables (transactions, holdings, and each expanded
 * lot list), each of which keeps its own sort state. Keeping the comparator
 * here means "how does a null sort" is answered once rather than three times.
 */

/**
 * Compare two values for a column.
 *
 * Missing values always sink to the bottom regardless of direction. A row with
 * no NAV is not "the smallest", it is unknown, and flipping the sort should not
 * promote it to the top.
 */
export const compareValues = (a, b, direction) => {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (a instanceof Date && b instanceof Date) {
    return direction === "asc" ? a - b : b - a;
  }

  const numA = typeof a === "number" ? a : Number.parseFloat(a);
  const numB = typeof b === "number" ? b : Number.parseFloat(b);
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return direction === "asc" ? numA - numB : numB - numA;
  }

  const cmp = String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return direction === "asc" ? cmp : -cmp;
};

/**
 * @param {Array} items
 * @param {{key: string, direction: "asc"|"desc"}} config
 * @param {Object<string, function>} accessors  column key -> value getter
 */
export const sortItems = (items, config, accessors = {}) => {
  if (!config?.key) return items;
  const get = accessors[config.key] ?? ((item) => item[config.key]);
  // Copy first: sorting the array in place would mutate React state.
  return [...items].sort((a, b) =>
    compareValues(get(a), get(b), config.direction)
  );
};

/** First click sorts ascending; clicking the same column again flips it. */
export const nextSortConfig = (current, key) =>
  current.key === key && current.direction === "asc"
    ? { key, direction: "desc" }
    : { key, direction: "asc" };

/** Value for the aria-sort attribute on a <th>. */
export const ariaSortFor = (config, key) => {
  if (config.key !== key) return "none";
  return config.direction === "asc" ? "ascending" : "descending";
};

/** The arrow shown next to a column label. */
export const sortIndicator = (config, key) => {
  if (config.key !== key) return "";
  return config.direction === "asc" ? " ↑" : " ↓";
};
