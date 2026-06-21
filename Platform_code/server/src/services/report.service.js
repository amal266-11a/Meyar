export function buildScanReport(scoredResult) {
  return {
    ...scoredResult,
    reportVersion: "real-scan-1"
  };
}
