import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import navRoutes from "./routes/navRoutes.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            // Tailwind and framer-motion both write inline styles.
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
  })
);

// In production the frontend is same-origin, so no cross-origin access is
// needed at all. ALLOWED_ORIGINS opts specific hosts back in.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors(
    isProduction
      ? { origin: allowedOrigins.length ? allowedOrigins : false }
      : { origin: true }
  )
);

app.use(express.json({ limit: "1mb" }));

// Scheme names are the user's own holdings. Keep them out of access logs.
morgan.token("safeurl", (req) => req.originalUrl.split("?")[0]);
app.use(
  morgan(
    isProduction
      ? ':remote-addr :method :safeurl :status :res[content-length] - :response-time ms'
      : ':method :safeurl :status :response-time ms'
  )
);

// The NAV endpoint triggers an upstream fetch and CPU-bound matching, so it is
// the one worth protecting. Unauthenticated and uncapped, it is an
// amplification vector against both this server and AMFI.
app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { status: false, error: "Too many requests, please slow down" },
  })
);

app.get("/api/health", (req, res) => res.json({ status: true }));
app.use("/api/nav", navRoutes);

if (isProduction) {
  const dist = path.join(__dirname, "../frontend/dist");
  app.use(express.static(dist));
  // SPA fallback for client-side routes such as /sheet.
  app.get("/{*splat}", (req, res) => res.sendFile(path.join(dist, "index.html")));
}

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (http://localhost:${PORT})`);
  if (!isProduction) console.log("NODE_ENV is not 'production': static files are not served");
});

// Let in-flight requests finish on redeploy instead of being cut off.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
