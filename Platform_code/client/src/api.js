const jsonHeaders = {
  "Content-Type": "application/json"
};

async function parseJson(response) {
  if (!response.ok) {
    throw new Error("تعذر تنفيذ الطلب");
  }

  return response.json();
}

export async function getHealth() {
  const response = await fetch("/api/health");
  return parseJson(response);
}

export async function getRules() {
  const response = await fetch("/api/rules");
  return parseJson(response);
}

export async function createScan(payload) {
  const response = await fetch("/api/scan", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  return parseJson(response);
}

export async function getScan(id) {
  const response = await fetch(`/api/scans/${id}`);
  return parseJson(response);
}

export async function getIssues(params = {}) {
  const search = new URLSearchParams(params);
  const query = search.toString();
  const response = await fetch(`/api/issues${query ? `?${query}` : ""}`);
  return parseJson(response);
}

export async function getIssue(id) {
  const response = await fetch(`/api/issues/${id}`);
  return parseJson(response);
}
