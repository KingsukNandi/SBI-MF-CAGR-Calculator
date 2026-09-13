"use client";

import { useMemo } from "react";

// Columns worth filtering on: categorical, low-cardinality, user-meaningful.
const FILTERABLE = [
  { key: "schemeName", label: "Scheme" },
  { key: "type", label: "Type" },
  { key: "folioNo", label: "Folio No" },
];

/**
 * Filter state is owned by Sheet and derived here -- the previous version kept
 * its own copy in useState and reset it inside an effect on every `data`
 * change, so the dropdowns cleared themselves mid-edit.
 */
const TableFilters = ({ rows, filters, onFilterChange }) => {
  const options = useMemo(() => {
    const map = {};
    for (const { key } of FILTERABLE) {
      const values = new Set();
      for (const row of rows) {
        const value = String(row[key] ?? "").trim();
        if (value) values.add(value);
      }
      map[key] = [...values].sort((a, b) => a.localeCompare(b));
    }
    return map;
  }, [rows]);

  const handleChange = (key, value) =>
    onFilterChange({ ...filters, [key]: value });

  const activeCount = Object.values(filters).filter((v) => v !== "").length;

  return (
    <div className="flex flex-wrap items-end gap-4">
      {FILTERABLE.map(({ key, label }) => {
        // A filter with one option filters nothing.
        if (options[key].length < 2) return null;
        return (
          <div key={key} className="flex flex-col">
            <label
              htmlFor={`filter-${key}`}
              className="text-xs font-medium text-gray-600 mb-1"
            >
              {label}
            </label>
            <select
              id={`filter-${key}`}
              value={filters[key] ?? ""}
              onChange={(e) => handleChange(key, e.target.value)}
              className="select select-bordered select-sm w-full max-w-xs border-[#00b5ef] focus:outline-[#00b5ef]"
            >
              <option value="">All ({options[key].length})</option>
              {options[key].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        );
      })}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onFilterChange({})}
          className="btn btn-sm btn-ghost text-[#00b5ef]"
        >
          Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
};

export default TableFilters;
