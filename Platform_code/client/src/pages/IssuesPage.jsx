import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getIssues } from "../api.js";

const severityOptions = ["الكل", "حرجة", "عالية", "متوسطة", "منخفضة"];
const statusOptions = ["الكل", "مفتوح", "يحتاج مراجعة", "تم الإصلاح"];

async function copyRecommendation(text) {
  try {
    await navigator.clipboard.writeText(text);
    window.alert("تم نسخ اقتراح الإصلاح.");
  } catch {
    window.alert("تعذر النسخ تلقائيًا. يمكنك نسخ النص يدويًا.");
  }
}

function includesText(value, query) {
  return String(value ?? "").toLowerCase().includes(query);
}

export default function IssuesPage() {
  const [searchParams] = useSearchParams();
  const scanId = searchParams.get("scanId");
  const [issues, setIssues] = useState([]);
  const [severity, setSeverity] = useState("الكل");
  const [status, setStatus] = useState("الكل");
  const [pageFilter, setPageFilter] = useState("الكل");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getIssues(scanId ? { scanId } : {}).then(setIssues);
  }, [scanId]);

  const pageOptions = useMemo(() => {
    const pages = issues.map((issue) => issue.pageName || issue.pageId).filter(Boolean);
    return ["الكل", ...new Set(pages)];
  }, [issues]);

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();

    return issues.filter((issue) => {
      const matchesSeverity = severity === "الكل" || issue.severity === severity;
      const matchesStatus = status === "الكل" || issue.status === status;
      const matchesPage =
        pageFilter === "الكل" || issue.pageName === pageFilter || issue.pageId === pageFilter;
      const matchesSearch =
        !query ||
        includesText(issue.description, query) ||
        includesText(issue.ruleCode, query) ||
        includesText(issue.recommendation, query);

      return matchesSeverity && matchesStatus && matchesPage && matchesSearch;
    });
  }, [issues, severity, status, pageFilter, search]);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <span className="section-kicker">{scanId ? "مخالفات الفحص الحالي" : "تقرير المخالفات"}</span>
          <h1 className="page-title">المخالفات المرصودة</h1>
          <p className="page-lead">
            قائمة بالمخالفات المؤكدة المرتبطة بمعايير الفحص، مع الأدلة الفنية وتوصيات الإصلاح.
          </p>
        </div>
        <span className="badge badge-primary">{filteredIssues.length} نتيجة</span>
      </div>

      <section className="panel filters-panel">
        <div className="filter-field">
          <label htmlFor="severity-filter">الخطورة</label>
          <select
            id="severity-filter"
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
          >
            {severityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="status-filter">الحالة</label>
          <select
            id="status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="page-filter">الصفحة</label>
          <select
            id="page-filter"
            value={pageFilter}
            onChange={(event) => setPageFilter(event.target.value)}
          >
            {pageOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field search-field">
          <label htmlFor="issue-search">بحث</label>
          <input
            id="issue-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث في الوصف أو كود المعيار أو التوصية"
          />
        </div>
      </section>

      <div className="issues-grid">
        {filteredIssues.map((issue) => (
          <article className="issue-card" key={issue.id}>
            <div className="issue-card-header">
              <div>
                <span className="muted">{issue.pageName}</span>
                <h2>{issue.title}</h2>
              </div>
              <span className={`badge severity-${issue.severity}`}>{issue.severity}</span>
            </div>

            <dl className="issue-meta">
              <div>
                <dt>نوع العنصر</dt>
                <dd>{issue.elementType || issue.componentType}</dd>
              </div>
              <div>
                <dt>كود المعيار</dt>
                <dd>{issue.ruleCode}</dd>
              </div>
              <div>
                <dt>اسم المعيار</dt>
                <dd>{issue.ruleName}</dd>
              </div>
              <div>
                <dt>حالة الخطأ</dt>
                <dd>
                  <span className="badge neutral">{issue.status}</span>
                </dd>
              </div>
            </dl>

            <p>{issue.description}</p>
            <div className="issue-note">
              <strong>سبب عدم المطابقة</strong>
              <span>{issue.reason}</span>
            </div>
            <div className="issue-note success-note">
              <strong>اقتراح الإصلاح</strong>
              <span>{issue.recommendation}</span>
            </div>

            <div className="card-actions">
              <Link className="button primary" to={`/issues/${issue.id}`}>
                عرض التفاصيل
              </Link>
              <button
                className="button secondary"
                onClick={() => copyRecommendation(issue.recommendation)}
              >
                نسخ اقتراح الإصلاح
              </button>
            </div>
          </article>
        ))}
      </div>

      {filteredIssues.length === 0 ? (
        <p className="empty-note">لا توجد مخالفات مطابقة للفلاتر الحالية.</p>
      ) : null}
    </section>
  );
}
