import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Sheet from "./components/Sheet";
import Uploader from "./components/Uploader";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-white">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Uploader />} />
            <Route path="/sheet" element={<Sheet />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </Router>
  );
}

export default App;
