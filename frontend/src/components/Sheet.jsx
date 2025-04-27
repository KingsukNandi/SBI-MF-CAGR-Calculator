import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { parse } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import TableFilters from "./TableFilters";

const Sheet = () => {
  const location = useLocation();
  const [data, setData] = useState(location.state?.data || []);
  const [filteredData, setFilteredData] = useState(data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "" });

  const BASE_URL = import.meta.env.MODE === "development" ? "http://localhost:3000" : "";

  useEffect(() => {
    const fetchNAVs = async () => {
      setLoading(true);
      setError("");

      const schemeNames = data
        .map((row) => row.SchemeName.trim().toLowerCase())
        .join(",");

      try {
        const response = await axios.get(
          `${BASE_URL}/api/nav?schemes=${schemeNames}`
        );
        const navData = response.data.data;
        console.log(navData);

        const updatedData = await data.map((row, index) => {
          const currentNAV = navData[index]?.data?.nav || "";

          const startNAV = parseFloat(row.NAV);
          const endNAV = parseFloat(currentNAV);
          const years = calculateYears(row.Date);

          const CAGR =
            endNAV && startNAV && years > 0
              ? ((endNAV / startNAV) ** (1 / years) - 1) * 100
              : "";

          const totalGain = (row.Amount * CAGR) / 100;
          let returnAmount =
            (parseFloat(totalGain?.toFixed(2)) || 0) +
            (parseFloat(row?.Amount) || 0);

          return {
            ...row,
            CurrentNAV: currentNAV,
            CAGR: CAGR ? CAGR.toFixed(4) : "",
            "Return Amount": returnAmount ? returnAmount.toFixed(2) : "",
            "Total Gain": totalGain ? totalGain.toFixed(2) : "",
          };
        });

        setData(updatedData);
        setFilteredData(updatedData);
      } catch (err) {
        setError("Failed to fetch NAV data");
        console.log(err);
      } finally {
        setLoading(false);
      }
    };

    fetchNAVs();
  }, []);

  const handleSearch = (e) => {
    setSearch(e.target.value);
  };

  const handleFilterChange = (updatedFilters) => {
    const filtered = data.filter((row) => {
      return Object.keys(updatedFilters).every((column) => {
        return (
          updatedFilters[column] === "" ||
          row[column] === updatedFilters[column]
        );
      });
    });
    setFilteredData(filtered);
  };

  const handleDateSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });

    const sorted = [...filteredData].sort((a, b) => {
      const valueA = a[key];
      const valueB = b[key];

      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return direction === "asc" ? -1 : 1;
      if (valueB == null) return direction === "asc" ? 1 : -1;

      const numericA = dateToNumber(valueA);
      const numericB = dateToNumber(valueB);

      return direction === "desc" ? numericA - numericB : numericB - numericA;
    });

    setFilteredData(sorted);
  };

  const dateToNumber = (dateStr) => {
    if (!dateStr) return Infinity;
    const [month, day, year] = String(dateStr).split("/");
    if (!month || !day || !year) return Infinity;

    return parseInt(
      year.padStart(4, "0") + month.padStart(2, "0") + day.padStart(2, "0"),
      10
    );
  };

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });

    const sorted = [...filteredData].sort((a, b) => {
      const valueA = a[key];
      const valueB = b[key];

      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return direction === "asc" ? -1 : 1;
      if (valueB == null) return direction === "asc" ? 1 : -1;

      const numA = parseFloat(valueA);
      const numB = parseFloat(valueB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return direction === "desc" ? numA - numB : numB - numA;
      }

      const strA = valueA.toString().toLowerCase();
      const strB = valueB.toString().toLowerCase();
      return direction === "desc"
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    });

    setFilteredData(sorted);
  };

  const calculateYears = (dateString) => {
    try {
      let parsedDate;
      if (dateString.includes("-")) {
        parsedDate = new Date(dateString);
      } else {
        parsedDate = parse(dateString, "MM/dd/yyyy", new Date());
      }
      const currentDate = new Date();
      return (currentDate - parsedDate) / (1000 * 60 * 60 * 24 * 365);
    } catch (error) {
      console.error("Date parsing error:", error);
      return 0;
    }
  };

  const handleNavInputChange = async (index, key, value) => {
    const updatedData = [...filteredData];

    if (key === "Date") {
      const [year, month, day] = value.split("-");
      value = `${month}/${day}/${year}`;
    }

    updatedData[index][key] = value;

    const startNAV = parseFloat(updatedData[index].NAV);
    const endNAV = parseFloat(updatedData[index].CurrentNAV);
    const amount = parseFloat(updatedData[index].Amount);
    const years = calculateYears(updatedData[index].Date);

    const CAGR =
      endNAV && startNAV && years > 0
        ? ((endNAV / startNAV) ** (1 / years) - 1) * 100
        : "";

    updatedData[index].CAGR = CAGR ? CAGR.toFixed(4) : "";

    const returnAmount = amount * (1 + CAGR / 100);
    const totalGain = returnAmount - amount;

    updatedData[index]["Return Amount"] = returnAmount
      ? returnAmount.toFixed(2)
      : "";
    updatedData[index]["Total Gain"] = totalGain ? totalGain.toFixed(2) : "";

    setFilteredData(updatedData);
    setData(updatedData);
  };

  const filteredSearchData = filteredData.filter((row) => {
    return Object.values(row).some((value) =>
      value.toString().toLowerCase().includes(search.toLowerCase())
    );
  });

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
    exit: {
      opacity: 0,
      y: -20,
      transition: { duration: 0.3 },
    },
  };

  const rowVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.3 },
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="200"
          height="200"
          viewBox="0 0 24 24"
        >
          <path
            fill="none"
            stroke="#00b5ef"
            stroke-linecap="round"
            stroke-width="2"
            d="M12 6.99998C9.1747 6.99987 6.99997 9.24998 7 12C7.00003 14.55 9.02119 17 12 17C14.7712 17 17 14.75 17 12"
          >
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              dur="560ms"
              from="0,12,12"
              repeatCount="indefinite"
              to="360,12,12"
              type="rotate"
            />
          </path>
        </svg>
      </div>
    );
  } else
    return (
      <motion.div
        className="w-full min-h-screen flex flex-col items-center p-8 bg-white"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {/*<h1 className="text-2xl font-bold mb-4 text-[#00b5ef]">
          Uploaded File Content
        </h1>*/}

        {error && <p className="text-red-500">{error}</p>}
        <div className="flex justify-between items-end w-full">
          <TableFilters data={data} onFilterChange={handleFilterChange} />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={handleSearch}
            className="input border-[#00b5ef] focus:outline-[#00b5ef] w-full max-w-xs mb-4"
          />
        </div>
        <AnimatePresence>
          <motion.div
            className="overflow-x-auto w-full"
            variants={containerVariants}
          >
            <table className="table w-full h-screen bg-white ">
              <thead className="sticky top-0 z-10 bg-[#00b5ef] text-white">
                <tr>
                  {data.length > 0 &&
                    Object.keys(data[0]).map((key) => {
                      if (key === "") return null;
                      return (
                        <th
                          key={key}
                          onClick={() =>
                            key === "Date"
                              ? handleDateSort(key)
                              : handleSort(key)
                          }
                          className="cursor-pointer hover:bg-[#0095c7]"
                        >
                          {key === "CurrentNAV" ? "Current NAV" : key}{" "}
                          {sortConfig.key === key
                            ? sortConfig.direction === "asc"
                              ? "↑"
                              : "↓"
                            : ""}
                        </th>
                      );
                    })}
                </tr>
              </thead>
              <tbody className="text-black">
                {filteredSearchData.map((row, index) => (
                  <motion.tr
                    key={index}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    transition={{ delay: index * 0.1 }}
                    className="hover:bg-gray-50"
                  >
                    {Object.keys(row).map((key, idx) => {
                      if (key === "") return null;

                      const isNegative =
                        (key === "CAGR" ||
                          key === "Return Amount" ||
                          key === "Total Gain") &&
                        parseFloat(row[key]) < 0;

                      const isPositive =
                        (key === "CAGR" ||
                          key === "Return Amount" ||
                          key === "Total Gain") &&
                        parseFloat(row[key]) > 0;

                      return (
                        <td
                          key={idx}
                          className={`
                        ${isNegative ? "text-red-500 font-medium" : ""}
                        ${isPositive ? "text-green-600 font-medium" : ""}
                      `}
                        >
                          {key === "CurrentNAV" ||
                          key === "Amount" ||
                          key === "NAV" ||
                          key === "Date" ? (
                            <input
                              type={key === "Date" ? "date" : "number"}
                              className="input input-ghost w-40 focus:outline-[#00b5ef]"
                              placeholder="Enter NAV"
                              value={
                                key === "Date"
                                  ? new Date(row[key])
                                      .toISOString()
                                      .slice(0, 10)
                                  : row[key] || ""
                              }
                              onChange={(e) =>
                                handleNavInputChange(index, key, e.target.value)
                              }
                            />
                          ) : (
                            row[key]
                          )}
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    );
};

export default Sheet;
