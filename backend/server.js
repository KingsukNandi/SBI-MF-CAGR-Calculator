import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import helmet from "helmet";
import navRoutes from "./routes/navRoutes.js";
import path from "path";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const __dirname = path.resolve();

app.use(cors());
app.use(express.json());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));

app.use("/api/nav", navRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.use(
    "/assets",
    express.static(path.join(__dirname, "frontend", "dist", "assets"))
  );

  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html"));
  });
}

//app.get("/", (req, res) => {
//  res.send("Hello from SBI_MF_calculator backend server");
//});

app.listen(PORT, () => {
  console.log(
    `Server is running on port ${process.env.PORT} (http://localhost:${process.env.PORT})`
  );
});
