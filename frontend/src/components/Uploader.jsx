import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Papa from "papaparse";

const Uploader = () => {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === "text/csv") {
      setFile(file);
      setError("");
    } else {
      setError("Please upload a CSV file");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file");
      return;
    }

    Papa.parse(file, {
      complete: (results) => {
        const headers = results.data[0];
        const rows = results.data
          .slice(1)
          .filter((row) => row.length === headers.length);

        const processedData = rows.map((row) => {
          const obj = {};
          headers.forEach((header, index) => {
            obj[header] = row[index];
          });
          return obj;
        });

        navigate("/sheet", { state: { data: processedData } });
      },
      header: false,
      skipEmptyLines: true,
    });
  };

  return (
    <motion.div
      className="min-h-screen flex items-center justify-center bg-white"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="bg-white border border-gray-200 p-8 rounded-lg shadow-lg w-96">
        <motion.h1
          className="text-2xl font-bold mb-6 text-center text-[#00b5ef]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Upload CSV File
        </motion.h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <motion.div
            className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-[#00b5ef] rounded-lg hover:border-[#0095c7] transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <input
              type="file"
              onChange={handleFileChange}
              accept=".csv"
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer text-[#00b5ef] hover:text-[#0095c7] transition-colors w-full h-full flex items-center justify-center"
            >
              <div>{file ? file.name : "Choose a CSV file"}</div>
            </label>
          </motion.div>
          {error && (
            <motion.p
              className="text-red-500 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.p>
          )}
          <motion.button
            type="submit"
            className="w-full bg-[#00b5ef] text-white py-2 px-4 rounded-lg hover:bg-[#0095c7] transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={!file}
          >
            Upload
          </motion.button>
        </form>
      </div>
    </motion.div>
  );
};

export default Uploader;
