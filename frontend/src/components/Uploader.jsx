import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";

const allowedExtensions = ["csv"];

const Uploader = () => {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    setError("");

    if (e.target.files.length) {
      const inputFile = e.target.files[0];
      const fileExtension = inputFile?.type.split("/")[1];

      if (!allowedExtensions.includes(fileExtension)) {
        setError("Please input a csv file");
        return;
      }

      setFile(inputFile);
    }
  };

  const handleSubmit = () => {
    if (!file) {
      setError("No file uploaded");
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        navigate("/sheet", { state: { data: result.data } });
      },
      error: () => {
        setError("Error parsing the file");
      },
    });
  };

  return (
    <div>
      <div className="w-full min-h-screen flex flex-col gap-16 justify-center items-center border border-black">
        <input
          type="file"
          className="file-input file-input-info file-input-xl"
          onChange={handleFileChange}
        />
        <button className="btn btn-info btn-xl" onClick={handleSubmit}>
          Submit
        </button>
      </div>

      <div className="toast toast-end">
        {error && (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Uploader;
