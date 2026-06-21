const DEFAULT_SCAN_TYPE = "full";
const ALLOWED_SCAN_TYPES = ["quick", "full", "accessibility", "components"];

export function validateScanRequest(body = {}) {
  const errors = [];
  const url = typeof body.url === "string" ? body.url.trim() : body.url;
  const scanType = typeof body.scanType === "string" ? body.scanType.trim() : body.scanType;

  if (!url) {
    errors.push("رابط الموقع مطلوب");
  } else if (typeof url !== "string") {
    errors.push("رابط الموقع يجب أن يكون نصًا");
  } else if (!url.startsWith("http://") && !url.startsWith("https://")) {
    errors.push("يجب أن يبدأ الرابط بـ http:// أو https://");
  }

  if (!ALLOWED_SCAN_TYPES.includes(scanType)) {
    errors.push("نوع الفحص غير صحيح");
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors
    };
  }

  return {
    isValid: true,
    value: {
      url,
      scanType
    }
  };
}

export function normalizeScanRequest(payload = {}) {
  const url = typeof payload.url === "string" ? payload.url.trim() : "";

  const scanType = typeof payload.scanType === "string" && payload.scanType.trim()
    ? payload.scanType.trim()
    : DEFAULT_SCAN_TYPE;

  return { url, scanType };
}
