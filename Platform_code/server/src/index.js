import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import issuesRoutes from "./routes/issues.routes.js";
import rulesRoutes from "./routes/rules.routes.js";
import scanRoutes from "./routes/scan.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use("/screenshots", express.static(path.join(__dirname, "..", "public", "screenshots")));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "الخادم يعمل بنجاح"
  });
});

app.use("/api", rulesRoutes);
app.use("/api", issuesRoutes);
app.use("/api", scanRoutes);

app.listen(port, () => {
  console.log(`Platform Code Checker API is running on http://localhost:${port}`);
});
