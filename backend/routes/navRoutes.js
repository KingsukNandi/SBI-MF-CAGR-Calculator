import e from "express";
import { getNav } from "../controllers/navControllers.js";

const router = e.Router();

router.get("/", getNav);

export default router;
