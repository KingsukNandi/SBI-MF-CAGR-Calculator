import React, { useState } from "react";

const TableSorter = ({ columns, onSortChange }) => {
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "" });

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
    onSortChange({ key, direction });
  };

  return (
    <div className="flex gap-4 mb-4">
      {columns.map((column) => (
        <button
          key={column}
          className="btn btn-secondary"
          onClick={() => handleSort(column)}
        >
          {column}{" "}
          {sortConfig.key === column
            ? sortConfig.direction === "asc"
              ? "↑"
              : "↓"
            : ""}
        </button>
      ))}
    </div>
  );
};

export default TableSorter;
