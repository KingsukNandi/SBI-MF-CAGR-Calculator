import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { parse } from "date-fns";
//import downloadCSV from "../utils/downloadCSV";
import TableFilters from "./TableFilters";

const Sheet = () => {
  const location = useLocation();
  const [data, setData] = useState(location.state?.data || []);
  const [filteredData, setFilteredData] = useState(data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "", direction: "" });

  useEffect(() => {
    const fetchNAVs = async () => {
      setLoading(true);
      setError("");

      const schemeNames = data
        .map((row) => row.SchemeName.trim().toLowerCase())
        .join(",");

      try {
        const response = await axios.get(
          `http://localhost:3000/api/nav?schemes=${schemeNames}&timestamp=${Date.now()}`
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

          return {
            ...row,
            CurrentNAV: currentNAV,
            CAGR: CAGR ? CAGR.toFixed(4) : "",
          };
        });

        setData(updatedData);
        setFilteredData(updatedData);
      } catch (err) {
        setError("Failed to fetch NAV data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchNAVs();
  }, []);

  const calculateYears = (dateString) => {
    try {
      const parsedDate = parse(dateString, "MM/dd/yyyy", new Date());
      const currentDate = new Date();
      return (currentDate - parsedDate) / (1000 * 60 * 60 * 24 * 365);
    } catch {
      return 0;
    }
  };

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

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });

    const sorted = [...filteredData].sort((a, b) => {
      const valueA = a[key];
      const valueB = b[key];

      // Handle null/undefined cases
      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return direction === "asc" ? -1 : 1;
      if (valueB == null) return direction === "asc" ? 1 : -1;

      // Try to parse as numbers
      const numA = parseFloat(valueA);
      const numB = parseFloat(valueB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return direction === "asc" ? numA - numB : numB - numA;
      }

      // Try to parse as dates
      const dateA = new Date(valueA);
      const dateB = new Date(valueB);
      if (!isNaN(dateA) && !isNaN(dateB)) {
        return direction === "asc" ? dateA - dateB : dateB - dateA;
      }

      // Fallback to string comparison
      const strA = valueA.toString().toLowerCase();
      const strB = valueB.toString().toLowerCase();
      return direction === "asc"
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    });

    setFilteredData(sorted);
  };

  //const handleDownload = () => {
  //  downloadCSV(data);
  //};

  const handleNavInputChange = (index, value) => {
    const updatedData = [...filteredData];
    updatedData[index].CurrentNAV = value;

    const startNAV = parseFloat(updatedData[index].NAV);
    const endNAV = parseFloat(value);
    const years = calculateYears(updatedData[index].Date);

    const CAGR =
      endNAV && startNAV && years > 0
        ? ((endNAV / startNAV) ** (1 / years) - 1) * 100
        : "";

    updatedData[index].CAGR = CAGR ? CAGR.toFixed(4) : "";
    setFilteredData(updatedData);
  };

  const filteredSearchData = filteredData.filter((row) => {
    return Object.values(row).some((value) =>
      value.toString().toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="w-full min-h-screen flex flex-col items-center p-8">
      <h1 className="text-2xl font-bold mb-4">Uploaded File Content</h1>
      {loading && <p>Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      <div className="flex justify-between items-center w-full">
        <TableFilters data={data} onFilterChange={handleFilterChange} />
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={handleSearch}
          className="input input-bordered w-full max-w-xs mb-4"
        />
        {/*<button className="btn btn-primary mb-4" onClick={handleDownload}>
          Download CSV
        </button>*/}
      </div>
      <div className="overflow-x-auto w-full">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              {data.length > 0 &&
                Object.keys(data[0]).map((key) => {
                  //console.log(key);
                  if (key == "") return;
                  else if (key == "CurrentNAV")
                    return (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="cursor-pointer"
                      >
                        Current NAV{" "}
                        {sortConfig.key === key
                          ? sortConfig.direction === "asc"
                            ? "↑"
                            : "↓"
                          : ""}
                      </th>
                    );
                  else
                    return (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        className="cursor-pointer"
                      >
                        {key}{" "}
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
          <tbody>
            {filteredSearchData.map((row, index) => {
              //console.log(row);
              return (
                <tr key={index}>
                  {Object.keys(row).map((key, idx) => {
                    if (key == "") return;
                    return (
                      <td key={idx}>
                        {key === "CurrentNAV" ? (
                          <input
                            type="number"
                            className="input input-ghost w-40"
                            placeholder="Enter NAV"
                            value={row[key] || ""}
                            onChange={(e) =>
                              handleNavInputChange(index, e.target.value)
                            }
                          />
                        ) : (
                          row[key]
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Sheet;
