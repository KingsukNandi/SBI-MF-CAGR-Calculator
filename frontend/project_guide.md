# SBI Mutual Fund CAGR Calculator - Detailed Project Specification

## Overview

The project aims to create a web application for calculating the Compound Annual Growth Rate (CAGR) and absolute returns for mutual fund investments based on user-uploaded CSV files. The application will fetch the current NAV values from a backend API and display the results in an interactive table.

---

## Features

### Core Features

1. **CSV Upload**:

   - Users can upload a `.csv` file containing the following columns:
     - `FolioNo`
     - `Date`
     - `SchemeName`
     - `Type`
     - `NAV`
     - `Amount`
   - Validate the file format to ensure it is `.csv`.

2. **CAGR Calculation**:

   - Formula: `CAGR = [(Ending Value / Beginning Value) ^ (1 / N)] - 1`
   - `Ending Value` is derived using the current NAV fetched from the backend API.
   - `N` is the number of years between the investment date and the current date.

3. **Absolute Return Calculation**:

   - Formula: `(End Value - Beginning Value) / Beginning Value * 100`

4. **Interactive Table**:

   - Display the uploaded CSV data along with:
     - Current NAV (fetched from the API).
     - Calculated CAGR.
   - Each row is clickable to show detailed calculations for that entry.

5. **Filtering Options**:

   - Filter by unique entries in any column (e.g., `Type`, `SchemeName`).
   - Date-based filtering (e.g., show data for 2024 or 2025).

6. **Sorting Options**:

   - Sort by any column (e.g., `Date`, `CAGR`, `Type`).
   - Ascending or descending order.

7. **Search Functionality**:

   - Search across all columns with autocomplete suggestions.

8. **Download CSV**:
   - Allow users to download the final table with calculated values as a `.csv` file.

---

## Challenges and Solutions

1. **Date Formatting**:

   - Handle inconsistent date formats (e.g., `MM/DD/YYYY`, `DD/MM/YYYY`).
   - Implement a function to normalize dates.

2. **Scheme Name Cleaning**:

   - Trim extra spaces and normalize names to lowercase before sending to the API.

3. **Missing NAV Values**:

   - Allow users to manually input missing NAV values.
   - Recalculate CAGR dynamically after each input.

4. **Error Handling**:
   - Show user-friendly error messages for issues like API failures or invalid file uploads.

---

## Backend API

### Endpoint

- **URL**: `http://localhost:3000/api/nav`
- **Method**: `GET`
- **Query Parameter**: `schemes` (comma-separated list of scheme names)

### Response

- **Success**:
  ```json
  {
    "status": true,
    "data": [
      {
        "statusCode": 200,
        "data": {
          "id": "12345",
          "scheme": "Scheme Name",
          "nav": "123.45",
          "date": "2025-04-25"
        }
      }
    ]
  }
  ```
- **Error**:
  ```json
  {
    "status": false,
    "error": "Failed to fetch NAV data"
  }
  ```

---

## Frontend Design

### Theme

- **Primary Colors**: White (`#ffffff`) and Blue (`#0081e4`).
- **Professional Look**: Subtle animations and micro-interactions.

### Components

1. **Uploader**:

   - File input for CSV upload.
   - Submit button with debouncing (limit to 1 click per 5 seconds).

2. **Table**:

   - Display data with filtering, sorting, and search functionality.
   - Include columns for `Current NAV` and `CAGR`.

3. **Row Detail Modal**:

   - Show detailed calculations for a selected row.

4. **Filters**:

   - Dropdowns for filtering by `Type` and `Date`.

5. **Download Button**:
   - Export the table as a CSV file.

---

## Performance and Security

1. **Backend**:

   - Cache API responses for 24 hours to reduce redundant requests.
   - Use `express-rate-limit` to prevent abuse.

2. **Frontend**:
   - Debounce user inputs to minimize API calls.
   - Validate all user inputs.

---

## Development Plan

### Backend

1. Set up Express server with routes for NAV fetching.
2. Implement caching and error handling.

### Frontend

1. Create React components for file upload, table display, and modals.
2. Integrate Tailwind CSS and DaisyUI for styling.
3. Implement filtering, sorting, and search functionality.

---

## Resources

- **Libraries**:
  - Backend: `express`, `axios`, `node-cache`
  - Frontend: `react`, `papaparse`, `react-router-dom`, `tailwindcss`, `daisyui`
- **API Documentation**: [AMFI NAV Data](https://www.amfiindia.com)

---

## Deployment

- **Backend**: Deploy on a Node.js server.
- **Frontend**: Deploy on Vercel or Netlify.

---

## Future Enhancements

1. Add user authentication for personalized data.
2. Integrate more advanced filtering and analytics.
3. Support additional file formats (e.g., Excel).
