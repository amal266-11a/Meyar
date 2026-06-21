import { useEffect, useMemo, useState } from "react";
import { getRules } from "../api.js";

const categoryLabels = {
  Foundations: "Foundations",
  Components: "Components",
  Accessibility: "Accessibility",
  "Government Content": "Government Content",
  Responsive: "Responsive",
  Performance: "Performance"
};

export default function RulesCatalogPage() {
  const [rules, setRules] = useState([]);

  useEffect(() => {
    getRules().then(setRules);
  }, []);

  const groupedRules = useMemo(() => {
    return rules.reduce((groups, rule) => {
      groups[rule.category] = groups[rule.category] ?? [];
      groups[rule.category].push(rule);
      return groups;
    }, {});
  }, [rules]);

  const categoryCounts = Object.keys(categoryLabels).map((category) => ({
    category,
    count: groupedRules[category]?.length ?? 0
  }));

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <span className="section-kicker">كتالوج المعايير</span>
          <h1 className="page-title">كتالوج معايير الفحص</h1>
          <p className="page-lead">
            يعرض هذا الكتالوج المعايير المستخدمة في التحليل، وتصنيف كل معيار، ووزنه، ونوع الفحص المرتبط به.
          </p>
        </div>
        <span className="badge badge-primary">{rules.length} معيار</span>
      </div>

      <div className="category-counts">
        {categoryCounts.map((item) => (
          <article className="count-card" key={item.category}>
            <span>{item.category}</span>
            <strong>{item.count} معايير</strong>
          </article>
        ))}
      </div>

      <div className="rules-sections">
        {Object.keys(categoryLabels).map((category) => (
          <section className="panel" key={category}>
            <div className="table-heading">
              <h2>{categoryLabels[category]}</h2>
              <span className="muted">{groupedRules[category]?.length ?? 0} معيار</span>
            </div>
            <div className="rules-grid">
              {(groupedRules[category] ?? []).map((rule) => (
                <article className="rule-card" key={rule.id}>
                  <div className="rule-card-header">
                    <span className="badge badge-primary">{rule.id}</span>
                    <span className={`badge severity-${rule.failureSeverity}`}>
                      {rule.failureSeverity}
                    </span>
                  </div>
                  <h3>{rule.title}</h3>
                  <p>{rule.description}</p>
                  <dl className="rule-meta">
                    <div>
                      <dt>التصنيف</dt>
                      <dd>{rule.category}</dd>
                    </div>
                    <div>
                      <dt>العنصر</dt>
                      <dd>{rule.element}</dd>
                    </div>
                    <div>
                      <dt>نوع الفحص</dt>
                      <dd>{rule.checkType}</dd>
                    </div>
                    <div>
                      <dt>الوزن</dt>
                      <dd>{rule.weight}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
