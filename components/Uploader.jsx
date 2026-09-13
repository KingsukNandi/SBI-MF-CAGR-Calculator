"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { pageTransition, tap, DURATION, EASE } from "@/lib/motion";
import Papa from "papaparse";
import { saveRows } from "@/lib/csvSession";

const REQUIRED = ["SchemeName", "Date", "NAV", "Amount"];
const OPTIONAL = ["FolioNo", "Type"];
const MAX_BYTES = 10 * 1024 * 1024;

const normalise = (header) => header.trim().toLowerCase().replace(/[\s_]/g, "");

// Excel-installed machines report .csv as application/vnd.ms-excel or "", so
// the old `file.type === "text/csv"` check rejected perfectly valid files.
const looksLikeCsv = (file) => /\.csv$/i.test(file.name);

const Uploader = () => {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const accept = (candidate) => {
    if (!candidate) return;
    if (!looksLikeCsv(candidate)) {
      setError("That file is not a .csv, export your statement as CSV first.");
      setFile(null);
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError("That file is larger than 10 MB.");
      setFile(null);
      return;
    }
    setError("");
    setFile(candidate);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file || busy) {
      if (!file) setError("Choose a CSV file first.");
      return;
    }

    setBusy(true);
    setError("");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        setBusy(false);

        const headers = results.meta.fields ?? [];
        const present = new Set(headers.map(normalise));
        const missing = REQUIRED.filter((r) => !present.has(normalise(r)));

        if (missing.length) {
          setError(
            `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ` +
              `Found: ${headers.join(", ") || "none"}.`
          );
          return;
        }

        // Drop rows that are entirely blank or have no scheme to look up.
        const rows = results.data.filter((row) =>
          Object.values(row).some((v) => String(v ?? "").trim() !== "")
        );

        if (!rows.length) {
          setError("That file has headers but no data rows.");
          return;
        }

        // React Router carried this in location.state; Next has no
        // equivalent and sessionStorage additionally survives a refresh.
        if (!saveRows(rows)) {
          setError(
            "Could not hand the rows to the next page, your browser blocked " +
              "session storage. Try a normal (non-private) window."
          );
          return;
        }
        router.push("/sheet");
      },
      error: (err) => {
        setBusy(false);
        setError(`Could not read that file: ${err.message}`);
      },
    });
  };

  return (
    <motion.div
      className="min-h-screen flex items-center justify-center bg-white p-4"
      initial={reduceMotion ? false : pageTransition.initial}
      animate={pageTransition.animate}
      transition={reduceMotion ? { duration: 0 } : pageTransition.transition}
    >
      <div className="bg-white border border-gray-200 p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2 text-center text-[#00b5ef]">
          Mutual fund returns
        </h1>
        <p className="text-sm text-gray-600 text-center mb-6">
          Upload a CSV of your transactions. Nothing is stored, everything is
          computed in your browser.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <motion.div
            animate={
              dragging && !reduceMotion ? { scale: 1.02 } : { scale: 1 }
            }
            transition={{ duration: DURATION.fast, ease: EASE }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center h-28 border-2 border-dashed rounded-lg transition-colors ${
              dragging
                ? "border-[#0095c7] bg-[#00b5ef]/5"
                : "border-[#00b5ef] hover:border-[#0095c7]"
            }`}
          >
            <input
              type="file"
              onChange={(e) => accept(e.target.files?.[0])}
              accept=".csv,text/csv"
              className="sr-only"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer text-[#00b5ef] hover:text-[#0095c7] w-full h-full flex flex-col items-center justify-center gap-1 text-center px-4"
            >
              <span className="font-medium">
                {file ? file.name : "Choose a CSV file"}
              </span>
              <span className="text-xs text-gray-500">
                {file
                  ? `${(file.size / 1024).toFixed(0)} KB, click to change`
                  : "or drag it here"}
              </span>
            </label>
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.p
                role="alert"
                initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: reduceMotion ? 0 : DURATION.fast, ease: EASE }}
                className="text-red-600 text-sm leading-relaxed overflow-hidden"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            whileTap={reduceMotion || !file || busy ? undefined : tap}
            className="w-full bg-[#00b5ef] text-white py-2 px-4 rounded-lg hover:bg-[#0095c7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!file || busy}
          >
            {busy ? "Reading…" : "Calculate returns"}
          </motion.button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-700">Required columns:</strong>{" "}
            {REQUIRED.join(", ")}
            <br />
            <strong className="text-gray-700">Optional:</strong> {OPTIONAL.join(", ")}
            <br />
            <code className="text-[11px]">NAV</code> is the NAV you bought at;{" "}
            <code className="text-[11px]">Amount</code> is what you invested.
          </p>
          <p className="text-xs text-gray-500 mt-2">
            <a href="/sample.csv" download className="text-[#00b5ef] hover:underline">
              Download a sample CSV
            </a>{" "}
            to see the expected shape.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default Uploader;
