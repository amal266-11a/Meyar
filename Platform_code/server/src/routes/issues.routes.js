import { Router } from "express";
import { getIssueController, getIssuesController } from "../controllers/issues.controller.js";

const router = Router();

router.get("/issues", getIssuesController);
router.get("/issues/:id", getIssueController);

export default router;
