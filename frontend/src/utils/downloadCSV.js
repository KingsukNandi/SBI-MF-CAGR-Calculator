import React from "react";
import { saveAs } from "file-saver";
import { json2csv } from "json-2-csv";

const downloadCSV = (data) => {
  json2csv(data, (err, csv) => {
    if (err) {
      console.error("Error generating CSV", err);
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "cagr_results.csv");
  });
};

export default downloadCSV;
