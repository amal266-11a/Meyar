export function calculateOverallScore(scan) {
  if (typeof scan.overallScore === "number") {
    return scan.overallScore;
  }

  const pages = Array.isArray(scan.pages) ? scan.pages : [];

  if (pages.length === 0) {
    return 0;
  }

  const total = pages.reduce((sum, page) => sum + calculatePageScore(page), 0);
  return Math.round(total / pages.length);
}

export function calculateCategoryScores(scan) {
  return Array.isArray(scan.categories) ? scan.categories : [];
}

export function calculatePageScore(page) {
  return typeof page.score === "number" ? page.score : 0;
}

export function calculateComponentScores(components = []) {
  return components.map((component) => ({
    ...component,
    score: typeof component.score === "number" ? component.score : 0
  }));
}

export function countIssuesBySeverity(issues = []) {
  return issues.reduce((counts, issue) => {
    const severity = issue.severity || "غير محدد";
    counts[severity] = (counts[severity] || 0) + 1;
    return counts;
  }, {});
}

export function getComplianceStatus(score) {
  if (score >= 90 && score <= 100) {
    return "مطابق بدرجة عالية";
  }

  if (score >= 75) {
    return "جيد";
  }

  if (score >= 60) {
    return "يحتاج تحسين";
  }

  return "غير مطابق";
}

export function calculateScores(scanResult) {
  const overallScore = calculateOverallScore(scanResult);
  const pages = Array.isArray(scanResult.pages) ? scanResult.pages : [];
  const components = Array.isArray(scanResult.components) ? scanResult.components : [];
  const issueIds = Array.isArray(scanResult.issueIds) ? scanResult.issueIds : [];

  return {
    ...scanResult,
    overallScore,
    totalPages: pages.length,
    totalElements: scanResult.totalElements,
    issuesCount: issueIds.length,
    criticalIssuesCount: scanResult.criticalIssuesCount,
    recommendationsCount: scanResult.recommendationsCount,
    categories: calculateCategoryScores(scanResult),
    components: calculateComponentScores(components),
    complianceStatus: getComplianceStatus(overallScore)
  };
}
