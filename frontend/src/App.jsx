import { BrowserRouter, Routes, Route } from "react-router-dom";
import Uploader from "./components/Uploader";
import Sheet from "./components/Sheet";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Uploader />} />
        <Route path="/sheet" element={<Sheet />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
