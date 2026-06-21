import { getRules } from "../services/rulesEngine.service.js";
import { sendOk } from "../utils/response.js";

export function getRulesController(req, res) {
  return sendOk(res, getRules());
}
