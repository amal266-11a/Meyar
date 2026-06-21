import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getIssue } from "../api.js";

export default function IssueDetailsPage() {
  const { id } = useParams();
  const [issue, setIssue] = useState(null);

  useEffect(() => {
    getIssue(id).then(setIssue);
  }, [id]);

  if (!issue) {
    return <section className="page">جاري تحميل تفاصيل المخالفة...</section>;
  }

  return (
    <section className="page detail-layout">
      <div className="page-header">
        <div>
          <span className="section-kicker">تفاصيل المخالفة</span>
          <h1 className="page-title">{issue.title}</h1>
          <p className="page-lead">
            {issue.pageName} · {issue.pageUrl} · {issue.elementType}
          </p>
        </div>
        <Link className="button ghost" to="/issues">
          رجوع
        </Link>
      </div>

      <div className="detail-grid">
        <aside className="panel">
          <div className="placeholder-shot">
            <span>معاينة العنصر المخالف</span>
            <strong>{issue.componentSelector}</strong>
          </div>
          <dl className="details compact">
            <div>
              <dt>كود المعيار</dt>
              <dd>{issue.ruleCode}</dd>
            </div>
            <div>
              <dt>اسم المعيار</dt>
              <dd>{issue.ruleName}</dd>
            </div>
            <div>
              <dt>درجة الخطورة</dt>
              <dd>
                <span className={`badge severity-${issue.severity}`}>{issue.severity}</span>
              </dd>
            </div>
            <div>
              <dt>الحالة</dt>
              <dd>{issue.status}</dd>
            </div>
          </dl>
        </aside>

        <div className="detail-sections">
          <article className="panel">
            <h2>ماذا وجد التحليل؟</h2>
            <p>{issue.found}</p>
          </article>
          <article className="panel">
            <h2>لماذا يعتبر مخالفة؟</h2>
            <p>{issue.why}</p>
          </article>
          <article className="panel">
            <h2>طريقة الإصلاح المقترحة</h2>
            <p>{issue.fix}</p>
          </article>
          <article className="panel code-comparison">
            <h2>مثال قبل وبعد</h2>
            <div className="comparison-grid">
              <div>
                <span className="badge error">قبل</span>
                <pre><code>{issue.before}</code></pre>
              </div>
              <div>
                <span className="badge success">بعد</span>
                <pre><code>{issue.after}</code></pre>
              </div>
            </div>
          </article>
          <article className="panel">
            <h2>كود مقترح للإصلاح</h2>
            <pre><code>{issue.code}</code></pre>
          </article>
        </div>
      </div>
    </section>
  );
}
