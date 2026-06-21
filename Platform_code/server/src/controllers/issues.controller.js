import { getAllStoredIssues, getStoredScanIssues, getStoredIssueById } from "../services/scan.service.js";
import { sendNotFound, sendOk } from "../utils/response.js";

function filterIssues(list, query) {
  const { pageId, severity, status } = query;
  return list.filter((issue) => {
    const matchesPage = pageId ? issue.pageId === pageId : true;
    const matchesSeverity = severity ? issue.severity === severity : true;
    const matchesStatus = status ? issue.status === status : true;
    return matchesPage && matchesSeverity && matchesStatus;
  });
}

export function getIssuesController(req, res) {
  const { scanId } = req.query;
  const sourceIssues = scanId ? getStoredScanIssues(scanId) : getAllStoredIssues();
  return sendOk(res, filterIssues(sourceIssues, req.query));
}

export function getIssueController(req, res) {
  const { scanId } = req.query;
  const sourceIssues = scanId ? getStoredScanIssues(scanId) : null;
  const issue = sourceIssues
    ? sourceIssues.find((item) => item.id === req.params.id)
    : getStoredIssueById(req.params.id);

  if (!issue) return sendNotFound(res, "لم يتم العثور على المخالفة");
  return sendOk(res, issue);
}
