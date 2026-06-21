export function success(res, data, message = "تمت العملية بنجاح") {
  return res.json(data);
}

export function error(res, statusCode, message, details = null) {
  const payload = {
    success: false,
    message
  };

  if (details) {
    payload.details = details;
  }

  return res.status(statusCode).json(payload);
}

export function sendOk(res, payload) {
  return success(res, payload);
}

export function sendCreated(res, payload) {
  res.status(201);
  return success(res, payload, "تم إنشاء المورد بنجاح");
}

export function sendNotFound(res, message = "Resource not found") {
  return error(res, 404, message);
}
