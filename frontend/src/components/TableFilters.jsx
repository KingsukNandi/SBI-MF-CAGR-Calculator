import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const TableFilters = ({ data, onFilterChange }) => {
  const [filters, setFilters] = useState({});
  const [columns, setColumns] = useState([]);

  useEffect(() => {
    if (data && data.length > 0) {
      const filterableColumns = Object.keys(data[0]).filter(
        (key) =>
          key !== "" &&
          key !== "CurrentNAV" &&
          key !== "CAGR" &&
          key !== "Return Amount" &&
          key !== "Total Gain"
      );
      setColumns(filterableColumns);

      const initialFilters = {};
      filterableColumns.forEach((column) => {
        initialFilters[column] = "";
      });
      setFilters(initialFilters);
    }
  }, [data]);

  const handleFilterChange = (column, value) => {
    const updatedFilters = { ...filters, [column]: value };
    setFilters(updatedFilters);
    onFilterChange(updatedFilters);
  };

  const getUniqueValues = (column) => {
    const values = [...new Set(data.map((row) => row[column]))];
    return values.filter((value) => value !== undefined && value !== "");
  };

  return (
    <motion.div
      className="flex flex-wrap gap-4 mb-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {columns.map((column) => {
        if (
          column === "FolioNo" ||
          column === "SchemeName" ||
          column === "Type"
        )
          return (
            <motion.div
              key={column}
              className="flex flex-col"
              whileHover={{ scale: 1.02 }}
            >
              <label className="text-sm font-medium text-gray-700 mb-1">
                {column}
              </label>
              <select
                value={filters[column] || ""}
                onChange={(e) => handleFilterChange(column, e.target.value)}
                className="select select-bordered w-full max-w-xs border-[#00b5ef] focus:outline-[#00b5ef]"
              >
                <option value="">All</option>
                {getUniqueValues(column).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </motion.div>
          );
      })}
    </motion.div>
  );
};

export default TableFilters;
