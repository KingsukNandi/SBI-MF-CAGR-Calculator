import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import helmet from "helmet";
import navRoutes from "./routes/navRoutes.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
//app.use(helmet());
//app.use(morgan("dev"));

app.use("/api/nav", navRoutes);

app.get("/", (req, res) => {
  res.send("Hello from SBI_MF_calculator backend server");
});

app.listen(PORT, () => {
  console.log(
    `Server is running on port ${process.env.PORT} (http://localhost:${process.env.PORT})`
  );
});
