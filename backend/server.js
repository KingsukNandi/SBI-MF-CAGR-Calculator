import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import helmet from "helmet";
import navRoutes from "./routes/navRoutes.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));

// API routes
app.use("/api/nav", navRoutes);

if (process.env.NODE_ENV === "production") {
  // Serve static assets first
  app.use(
    "/assets",
    express.static(path.join(__dirname, "../frontend/dist/assets"))
  );

  // Serve static files from dist
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  // Handle all other routes - note the :splat param
  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} (http://localhost:${PORT})`);
});
