import { createScan, getScanById } from "../services/scan.service.js";
import { sendCreated, sendNotFound, sendOk, error } from "../utils/response.js";
import { validateScanRequest } from "../utils/validators.js";

export async function createScanController(req, res) {
  const validation = validateScanRequest(req.body);

  if (!validation.isValid) {
    return error(res, 400, "تعذر بدء الفحص بسبب بيانات غير صحيحة", validation.errors);
  }

  const scan = await createScan(validation.value);
  return sendCreated(res, scan);
}

export function getScanController(req, res) {
  const scan = getScanById(req.params.id);

  if (!scan) {
    return sendNotFound(res, "لم يتم العثور على نتيجة الفحص");
  }

  return sendOk(res, scan);
}
