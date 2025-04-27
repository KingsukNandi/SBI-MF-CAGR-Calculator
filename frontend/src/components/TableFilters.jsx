import React, { useState } from "react";

const TableFilters = ({ data, onFilterChange }) => {
  const [filters, setFilters] = useState({});

  const handleFilterChange = (column, value) => {
    const updatedFilters = { ...filters, [column]: value };
    setFilters(updatedFilters);
    onFilterChange(updatedFilters);
  };

  const uniqueValues = (column) => {
    return [...new Set(data.map((row) => row[column]))];
  };

  return (
    <div className="flex flex-nowrap justify-evenly gap-4 mb-4">
      {Object.keys(data[0] || {}).map((column) => {
        if (
          column === "FolioNo" ||
          column === "SchemeName" ||
          column === "Type"
        )
          return (
            <div key={column} className="flex flex-col">
              <label className="font-bold mb-2">{column}</label>
              <select
                className="select select-bordered"
                onChange={(e) => handleFilterChange(column, e.target.value)}
              >
                <option value="">All</option>
                {uniqueValues(column).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          );
      })}
    </div>
  );
};

export default TableFilters;
