import { Router } from "express";
import { getRulesController } from "../controllers/rules.controller.js";

const router = Router();

router.get("/rules", getRulesController);

export default router;
