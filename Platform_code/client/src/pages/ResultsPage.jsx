import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getScan } from "../api.js";

function exportUnavailable(type) {
  window.alert(`تصدير ${type} غير مفعل حاليًا. استخدمي تصدير JSON المتاح.`);
}

function exportJson(scan) {
  const scanId = scan.scanId || scan.id || "scan";
  const blob = new Blob([JSON.stringify(scan, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `platform-code-scan-${scanId}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function progressClass(score) {
  if (score >= 85) return "success";
  if (score >= 70) return "warning";
  return "error";
}

function yesNoStatus(value) {
  return value
    ? { label: "مطابق", className: "success" }
    : { label: "يحتاج تحسين", className: "warning" };
}

function absoluteAssetUrl(value) {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  if (value.startsWith("/screenshots")) return `http://localhost:4000${value}`;
  return value;
}

function statusClass(status) {
  if (status === "مطابق") return "success";
  if (status === "غير مطابق") return "error";
  if (status === "غير مطبق" || status === "ط؛ظٹط± ظ…ط·ط¨ظ‚") return "neutral";
  return "warning";
}

function copyText(value) {
  if (!value) return;
  navigator.clipboard?.writeText(value);
}

function EvidenceValue({ label, value, code = false }) {
  if (!value) return null;
  return (
    <div className="evidence-line">
      <strong>{label}</strong>
      {code ? <code>{value}</code> : <span>{value}</span>}
    </div>
  );
}

function IssueScreenshot({ issue }) {
  const [failed, setFailed] = useState(false);
  const src = issue.screenshotCaptured && issue.screenshotKind === "element"
    ? absoluteAssetUrl(issue.screenshotUrl)
    : null;

  if (!src || failed) {
    return <div className="screenshot-fallback">لم تتوفر لقطة موثوقة للعنصر</div>;
  }

  return (
    <img
      className="issue-screenshot"
      src={src}
      alt={`صورة عنصر مخالف ${issue.ruleCode}`}
      onError={() => setFailed(true)}
    />
  );
}

function IssueCard({ issue }) {
  const evidence = issue.evidenceDetails || {};
  const confidenceLabel = issue.confidence === "medium" ? "ثقة متوسطة" : issue.confidence === "low" ? "ثقة منخفضة" : "ثقة عالية";

  return (
    <article className="real-issue-card">
      <div className="rule-card-header">
        <span className="badge badge-primary">{issue.ruleCode}</span>
        <span className={`badge severity-${issue.severity}`}>{issue.severity}</span>
        <span className={`badge confidence-${issue.confidence || "high"}`}>{confidenceLabel}</span>
        {issue.occurrences > 1 ? <span className="badge neutral">تكررت {issue.occurrences} مرات</span> : null}
      </div>
      <IssueScreenshot issue={issue} />
      <h4>{issue.title}</h4>
      <p>{issue.description}</p>
      <div className="issue-actions">
        {issue.pageUrl ? (
          <a className="button table-button" href={issue.pageUrl} target="_blank" rel="noreferrer">
            فتح الصفحة الأصلية
          </a>
        ) : null}
        <button className="button table-button" type="button" onClick={() => copyText(issue.fullSelector || issue.selector || issue.simpleSelector)}>
          نسخ selector
        </button>
        <button className="button table-button" type="button" onClick={() => copyText(issue.htmlSnippet)}>
          نسخ HTML
        </button>
      </div>
      <div className="evidence-block">
        <strong>رابط الصفحة التي ظهر فيها العنصر</strong>
        <span className="page-url-text">{issue.pageUrl || "غير متوفر"}</span>
      </div>
      {issue.simpleSelector || issue.selector ? (
        <div className="evidence-block">
          <strong>selector مبسط</strong>
          <code>{issue.simpleSelector || issue.selector}</code>
          <span className="evidence-note">هذا المحدد يخص الصفحة الموضحة أعلاه وقد لا يظهر في صفحة أخرى.</span>
          {issue.fullSelector && issue.fullSelector !== issue.simpleSelector ? (
            <details>
              <summary>عرض selector الكامل</summary>
              <code>{issue.fullSelector}</code>
            </details>
          ) : null}
        </div>
      ) : null}
      <div className="evidence-block">
        <strong>أدلة تساعد على العثور على العنصر</strong>
        <EvidenceValue label="النص الظاهر" value={evidence.text} />
        <EvidenceValue label="alt" value={evidence.alt} />
        <EvidenceValue label="href" value={evidence.href} code />
        <EvidenceValue label="aria-label" value={evidence.ariaLabel} />
        <EvidenceValue label="src" value={evidence.src} code />
        <EvidenceValue label="الدليل الآلي" value={issue.evidence} />
      </div>
      {issue.htmlSnippet ? (
        <details className="evidence-block">
          <summary>HTML</summary>
          <pre><code>{issue.htmlSnippet}</code></pre>
        </details>
      ) : null}
      <small>{issue.recommendation}</small>
    </article>
  );
}

function CriteriaTable({ title, kicker, items, emptyText }) {
  return (
    <section className="panel criteria-panel">
      <div className="table-heading">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
        <span className="badge badge-primary">{items.length} معيار</span>
      </div>
      {items.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>المعيار</th>
                <th>التصنيف</th>
                <th>الدرجة</th>
                <th>الحالة</th>
                <th>سبب الحكم</th>
              </tr>
            </thead>
            <tbody>
              {items.map((criterion) => (
                <tr key={criterion.id}>
                  <td>
                    <strong>{criterion.ruleCode}</strong>
                    <br />
                    <span className="muted">{criterion.title}</span>
                  </td>
                  <td>{criterion.category}</td>
                  <td>
                    <div className="inline-progress">
                      {typeof criterion.score === "number" ? (
                        <>
                          <span>{criterion.score}%</span>
                          <div className="progress-track">
                            <div className={`progress-fill ${progressClass(criterion.score)}`} style={{ width: `${criterion.score}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="muted">غير محسوب في النسبة</span>
                      )}
                    </div>
                  </td>
                  <td><span className={`badge ${statusClass(criterion.status)}`}>{criterion.status}</span></td>
                  <td className="muted">{criterion.status === "غير مطبق" ? "لم يتم العثور على هذا المكوّن في الصفحات المفحوصة." : criterion.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-note">{emptyText}</p>
      )}
    </section>
  );
}

function RealScanSection({ realScan }) {
  if (!realScan) {
    return null;
  }

  if (!realScan.enabled) {
    return (
      <section className="panel real-scan-panel warning-panel">
        <span className="section-kicker">مؤشرات الفحص الفعلية</span>
        <h2>تعذر تنفيذ التحليل الفعلي</h2>
        <p>{realScan.warning}</p>
        {realScan.error ? <p className="real-scan-error">{realScan.error}</p> : null}
        <p>لم يتم احتساب أي أرقام تجريبية. يرجى إعادة الفحص بعد التأكد من الرابط.</p>
      </section>
    );
  }

  const dom = realScan.domSummary ?? {};
  const accessibility = realScan.accessibilitySummary ?? {};
  const allDetectedIssues = realScan.detectedIssues ?? [];
  const detectedIssues = realScan.reliableIssues ?? allDetectedIssues.filter((issue) => issue.confidence !== "low");
  const lowConfidenceIssues = realScan.lowConfidenceIssues ?? allDetectedIssues.filter((issue) => issue.confidence === "low");
  const metrics = [
    { label: "حالة الفحص", value: "تم تنفيذ التحليل الفعلي" },
    { label: "عنوان الصفحة", value: realScan.title || "غير متوفر" },
    { label: "الرابط النهائي", value: realScan.finalUrl || "غير متوفر" },
    { label: "عدد الروابط", value: dom.linksCount ?? 0 },
    { label: "عدد الصور", value: dom.imagesCount ?? 0 },
    { label: "عدد الأزرار", value: dom.buttonsCount ?? 0 },
    { label: "عدد الحقول", value: dom.inputsCount ?? 0 },
    { label: "عدد العناوين", value: dom.headingsCount ?? 0 },
    { label: "مخالفات axe", value: accessibility.violationsCount ?? 0 },
    { label: "فحوص ناجحة", value: accessibility.passesCount ?? 0 },
    { label: "تحتاج مراجعة", value: accessibility.incompleteCount ?? 0 }
  ];
  const checks = [
    { label: 'وجود lang="ar"', passed: dom.hasLangAr },
    { label: 'وجود dir="rtl"', passed: dom.hasRtl },
    { label: "صور بدون alt", passed: (dom.imagesWithoutAltCount ?? 0) === 0, value: dom.imagesWithoutAltCount ?? 0 },
    { label: "أزرار بدون نص", passed: (dom.buttonsWithoutTextCount ?? 0) === 0, value: dom.buttonsWithoutTextCount ?? 0 },
    { label: "حقول بدون label", passed: (dom.inputsWithoutLabelCount ?? 0) === 0, value: dom.inputsWithoutLabelCount ?? 0 },
    { label: "روابط ضعيفة النص", passed: (dom.linksWithWeakTextCount ?? 0) === 0, value: dom.linksWithWeakTextCount ?? 0 },
    { label: "وجود H1", passed: dom.hasH1 },
    { label: "ترتيب العناوين", passed: dom.headingOrderLooksValid }
  ];

  return (
    <section className="panel real-scan-panel">
      <div className="table-heading">
        <div>
          <span className="section-kicker">مؤشرات الفحص الفعلية</span>
          <h2>مؤشرات حقيقية من الموقع المفحوص</h2>
        </div>
        <span className="badge success">تم التنفيذ</span>
      </div>

      <div className="real-scan-grid">
        {metrics.map((metric) => (
          <article className="real-scan-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong title={String(metric.value)}>{metric.value}</strong>
          </article>
        ))}
      </div>

      <div className="real-scan-checks">
        {checks.map((check) => {
          const status = yesNoStatus(check.passed);

          return (
            <div className="check-row" key={check.label}>
              <span>{check.label}</span>
              <div>
                {typeof check.value === "number" ? <strong>{check.value}</strong> : null}
                <span className={`badge ${status.className}`}>{status.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="real-issues-section">
        <h3>المخالفات المؤكدة</h3>
        {detectedIssues.length > 0 ? (
          <div className="real-issues-grid">
            {detectedIssues.map((issue) => (
              <article className="real-issue-card" key={issue.id}>
                <div className="rule-card-header">
                  <span className="badge badge-primary">{issue.ruleCode}</span>
                  <span className={`badge severity-${issue.severity}`}>{issue.severity}</span>
                  <span className={`badge confidence-${issue.confidence || "high"}`}>{issue.confidence === "medium" ? "ثقة متوسطة" : "ثقة عالية"}</span>
                  {issue.occurrences > 1 ? <span className="badge neutral">تكررت {issue.occurrences} مرات</span> : null}
                </div>
                <IssueScreenshot issue={issue} />
                {false && issue.screenshotUrl ? (
                  <img
                    className="issue-screenshot"
                    src={absoluteAssetUrl(issue.screenshotUrl)}
                    alt={`صورة مخالفة ${issue.ruleCode}`}
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                <h4>{issue.title}</h4>
                <p>{issue.description}</p>
                <div className="issue-actions">
                  {issue.pageUrl ? (
                    <a className="button table-button" href={issue.pageUrl} target="_blank" rel="noreferrer">
                      فتح الصفحة الأصلية
                    </a>
                  ) : null}
                  <button className="button table-button" type="button" onClick={() => copyText(issue.fullSelector || issue.selector || issue.simpleSelector)}>
                    نسخ selector
                  </button>
                  <button className="button table-button" type="button" onClick={() => copyText(issue.htmlSnippet)}>
                    نسخ HTML
                  </button>
                </div>
                <div className="evidence-block">
                  <strong>رابط الصفحة التي ظهر فيها العنصر</strong>
                  <span className="page-url-text">{issue.pageUrl || "غير متوفر"}</span>
                </div>
                {issue.simpleSelector || issue.selector ? (
                  <div className="evidence-block">
                    <strong>selector مبسط</strong>
                    <code>{issue.simpleSelector || issue.selector}</code>
                    <span className="evidence-note">هذا المحدد يخص الصفحة الموضحة أعلاه وقد لا يظهر في صفحة أخرى.</span>
                    {issue.fullSelector && issue.fullSelector !== issue.simpleSelector ? (
                      <details>
                        <summary>عرض selector الكامل</summary>
                        <code>{issue.fullSelector}</code>
                      </details>
                    ) : null}
                  </div>
                ) : null}
                <div className="evidence-block">
                  <strong>أدلة تساعد على العثور على العنصر</strong>
                  <EvidenceValue label="النص الظاهر" value={issue.evidenceDetails?.text} />
                  <EvidenceValue label="alt" value={issue.evidenceDetails?.alt} />
                  <EvidenceValue label="href" value={issue.evidenceDetails?.href} code />
                  <EvidenceValue label="aria-label" value={issue.evidenceDetails?.ariaLabel} />
                  <EvidenceValue label="src" value={issue.evidenceDetails?.src} code />
                  <EvidenceValue label="الدليل الآلي" value={issue.evidence} />
                </div>
                {false && issue.selector ? (
                  <div className="evidence-block">
                    <strong>مكان العنصر / selector وقت الفحص</strong>
                    <code>{issue.selector}</code>
                    {issue.selectorVerified === false ? (
                      <span className="evidence-note">لم يتم التقاط صورة مستقلة للعنصر، وقد يكون العنصر مخفيًا أو متغيرًا بعد تحميل الصفحة.</span>
                    ) : null}
                  </div>
                ) : null}
                {issue.htmlSnippet ? (
                  <div className="evidence-block">
                    <strong>HTML</strong>
                    <pre><code>{issue.htmlSnippet}</code></pre>
                  </div>
                ) : null}
                {issue.evidence ? (
                  <div className="evidence-block">
                    <strong>الدليل</strong>
                    <span>{issue.evidence}</span>
                  </div>
                ) : null}
                <small>{issue.recommendation}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-note">لم يتم اكتشاف مخالفات حقيقية في الفحص الجزئي.</p>
        )}
      </div>
      {lowConfidenceIssues.length > 0 ? (
        <details className="low-confidence-section">
          <summary>ملاحظات تحتاج تحقق ({lowConfidenceIssues.length})</summary>
          <p className="evidence-note">تم نقل العناصر الديناميكية مثل السلايدر والكروسل إلى الملاحظات عند عدم وجود دليل مؤكد على مخالفتها.</p>
          <div className="real-issues-grid">
            {lowConfidenceIssues.map((issue) => (
              <IssueCard issue={issue} key={issue.id} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default function ResultsPage() {
  const { id } = useParams();
  const [scan, setScan] = useState(null);

  useEffect(() => {
    getScan(id).then(setScan);
  }, [id]);

  if (!scan) {
    return <section className="page">جاري تحميل النتائج...</section>;
  }

  const metrics = [
    { label: "نسبة الالتزام العامة", value: `${scan.overallScore}%` },
    { label: "الصفحات المفحوصة", value: scan.totalPages },
    { label: "العناصر المفحوصة", value: scan.totalElements },
    { label: "عدد المخالفات", value: scan.issuesCount },
    { label: "المخالفات الحرجة", value: scan.criticalIssuesCount }
  ];
  const executiveSummary = scan.reportMode === "real"
    ? `تم فحص ${scan.totalPages} صفحة/صفحات من الموقع الحقيقي وتحليل ${scan.totalElements} عنصرًا. بلغت نسبة التطابق الآلية ${scan.overallScore}%. تم رصد ${scan.issuesCount} مخالفة فعلية مدعومة بدليل من DOM أو axe-core، منها ${scan.criticalIssuesCount} حرجة. المعايير التي تحتاج مراجعة يدوية ظاهرة بدرجة مستقلة داخل جدول المعايير.`
    : `تم فحص ${scan.totalPages} صفحات و${scan.totalElements} عنصرًا. بلغت نسبة الالتزام العامة ${scan.overallScore}%. تم رصد ${scan.issuesCount} مخالفة، منها ${scan.criticalIssuesCount} حرجة. تظهر أبرز فرص التحسين في الوصولية والمكونات، مع وجود مخالفات تحتاج معالجة قبل الوصول إلى امتثال كامل.`;
  const criteriaResults = scan.criteriaResults || [];
  const automatedCriteria = criteriaResults.filter((item) => item.status !== "غير مطبق" && item.status !== "ط؛ظٹط± ظ…ط·ط¨ظ‚" && item.status !== "يحتاج مراجعة" && item.status !== "ظٹط­طھط§ط¬ ظ…ط±ط§ط¬ط¹ط©");
  const notApplicableCriteria = criteriaResults.filter((item) => item.status === "غير مطبق" || item.status === "ط؛ظٹط± ظ…ط·ط¨ظ‚");
  const manualReviewCriteria = criteriaResults.filter((item) => item.status === "يحتاج مراجعة" || item.status === "ظٹط­طھط§ط¬ ظ…ط±ط§ط¬ط¹ط©");

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <span className="section-kicker">لوحة النتائج</span>
          <h1 className="page-title">تقرير الالتزام</h1>
          {scan.reportLabel ? <span className="badge success report-mode-badge">{scan.reportLabel}</span> : null}
          <p className="page-lead">
            {scan.url} · {scan.scanType} · {scan.recommendationsCount} توصية
          </p>
        </div>
        <div className="export-actions">
          <button className="button secondary" onClick={() => exportUnavailable("PDF")}>
            تصدير PDF
          </button>
          <button className="button secondary" onClick={() => exportJson(scan)}>
            تصدير JSON
          </button>
          <button className="button secondary" onClick={() => exportUnavailable("CSV")}>
            تصدير CSV
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>

      <div className="insight-grid">
        <article className="panel insight-card">
          <span className="section-kicker">ملخص تنفيذي</span>
          <h2>قراءة سريعة لنتيجة الفحص</h2>
          <p>{executiveSummary}</p>
        </article>
        <article className="panel insight-card">
          <span className="section-kicker">منهجية حساب النسبة</span>
          <h2>منهجية احتساب النتيجة</h2>
          <ul>
            <li>النسبة العامة تُحسب من المعايير القابلة للفحص آليًا فقط حتى لا تنخفض بسبب معايير تحتاج مراجعة بشرية.</li>
            <li>المعايير غير القابلة للحكم الآلي تظهر كـ "يحتاج مراجعة" ولا تدخل في نسبة التطابق.</li>
            <li>تُعرض النتائج على مستوى عام، صفحة، تصنيف، ومكون مع دليل وصورة للمخالفة عند الإمكان.</li>
            <li>{scan.reportMode === "real" ? "في الفحص الحقيقي تُحسب النسبة من نتائج DOM وaxe-core والزحف الحقيقي للصفحات." : "الفحص الحقيقي يعزز التقرير لكنه لا يستبدل كتالوج المعايير."}</li>
          </ul>
        </article>
      </div>

      <div className="panel score-dashboard">
        <div className="score-ring large" style={{ "--score": scan.overallScore }}>
          <span>{scan.overallScore}%</span>
        </div>
        <div>
          <h2>مؤشر الالتزام العام</h2>
          <p>
            النتيجة مبنية على المعايير الآلية فقط، أما المعايير التي تحتاج مراجعة بشرية
            فتظهر بشكل منفصل ولا تؤثر على نسبة التطابق.
          </p>
          <div className="progress-track">
            <div
              className={`progress-fill ${progressClass(scan.overallScore)}`}
              style={{ width: `${scan.overallScore}%` }}
            />
          </div>
        </div>
      </div>

      <div className="category-grid">
        {scan.categories.map((category) => (
          <article className="card category-card" key={category.id}>
            <span className="muted">{category.englishName}</span>
            <strong>{category.name}</strong>
            <div className="progress-track">
              <div
                className={`progress-fill ${progressClass(category.score ?? 0)}`}
                style={{ width: `${category.score ?? 0}%` }}
              />
            </div>
            <div className="card-footer">
              <span>{typeof category.score === "number" ? `${category.score}%` : "مراجعة"}</span>
              <span>{category.issuesCount} مخالفات</span>
            </div>
          </article>
        ))}
      </div>

      {criteriaResults.length ? (
        <>
          <CriteriaTable
            title="نتائج المعايير الآلية"
            kicker="B) Automated criteria results"
            items={automatedCriteria}
            emptyText="لا توجد معايير آلية محسوبة في هذا التقرير."
          />
          <CriteriaTable
            title="المعايير غير المطبقة"
            kicker="C) Not applicable criteria"
            items={notApplicableCriteria}
            emptyText="لم تظهر معايير غير مطبقة في الصفحات المفحوصة."
          />
          <CriteriaTable
            title="معايير تحتاج مراجعة يدوية"
            kicker="D) Needs manual review criteria"
            items={manualReviewCriteria}
            emptyText="لا توجد معايير تحتاج مراجعة يدوية في هذا التقرير."
          />
        </>
      ) : null}

      {false && scan.criteriaResults?.length ? (
        <section className="panel criteria-panel">
          <div className="table-heading">
            <div>
              <span className="section-kicker">درجات معايير مِعيار</span>
              <h2>حالة كل معيار في الفحص</h2>
            </div>
            <span className="badge badge-primary">{scan.criteriaResults.length} معيار</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المعيار</th>
                  <th>التصنيف</th>
                  <th>الدرجة</th>
                  <th>الحالة</th>
                  <th>سبب الحكم</th>
                </tr>
              </thead>
              <tbody>
                {scan.criteriaResults.map((criterion) => (
                  <tr key={criterion.id}>
                    <td>
                      <strong>{criterion.ruleCode}</strong>
                      <br />
                      <span className="muted">{criterion.title}</span>
                    </td>
                    <td>{criterion.category}</td>
                    <td>
                      <div className="inline-progress">
                        {typeof criterion.score === "number" ? (
                          <>
                            <span>{criterion.score}%</span>
                            <div className="progress-track">
                              <div className={`progress-fill ${progressClass(criterion.score)}`} style={{ width: `${criterion.score}%` }} />
                            </div>
                          </>
                        ) : (
                          <span className="muted">غير محسوب آليًا</span>
                        )}
                      </div>
                    </td>
                    <td><span className={`badge ${statusClass(criterion.status)}`}>{criterion.status}</span></td>
                    <td className="muted">{criterion.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <RealScanSection realScan={scan.realScan} />

      <section className="panel">
        <div className="table-heading">
          <h2>نتائج الصفحات</h2>
          <Link className="button ghost" to={`/issues?scanId=${scan.scanId || scan.id}`}>
            عرض كل المخالفات
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>اسم الصفحة</th>
                <th>الرابط</th>
                <th>نسبة الالتزام</th>
                <th>عدد الأخطاء</th>
                <th>الحالة</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {scan.pages.map((page) => (
                <tr key={page.id}>
                  <td>{page.name}</td>
                  <td className="muted">{page.path}</td>
                  <td>
                    <div className="inline-progress">
                      <span>{page.score}%</span>
                      <div className="progress-track">
                        <div
                          className={`progress-fill ${progressClass(page.score)}`}
                          style={{ width: `${page.score}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>{page.issuesCount}</td>
                  <td>
                    <span className={`badge ${progressClass(page.score)}`}>
                      {page.status}
                    </span>
                  </td>
                  <td>
                    <Link className="button table-button" to={`/issues?scanId=${scan.scanId || scan.id}`}>
                      عرض المخالفات
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>نتائج العناصر</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نوع العنصر</th>
                <th>عدد العناصر</th>
                <th>نسبة الالتزام</th>
                <th>أكثر خطأ متكرر</th>
                <th>الخطورة</th>
              </tr>
            </thead>
            <tbody>
              {scan.components.map((component) => (
                <tr key={component.type}>
                  <td>{component.type}</td>
                  <td>{component.count}</td>
                  <td>{component.score}%</td>
                  <td className="muted">{component.mostFrequentIssue}</td>
                  <td>
                    <span className={`badge severity-${component.severity}`}>
                      {component.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
