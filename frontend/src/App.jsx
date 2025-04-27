import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Sheet from "./components/Sheet";
import Uploader from "./components/Uploader";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-white">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Uploader />} />
            <Route path="/sheet" element={<Sheet />} />
          </Routes>
        </AnimatePresence>
      </div>
    </Router>
  );
}

export default App;
