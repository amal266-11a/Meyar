import { Router } from "express";
import { createScanController, getScanController } from "../controllers/scan.controller.js";

const router = Router();

router.post("/scan", createScanController);
router.get("/scans/:id", getScanController);

export default router;
