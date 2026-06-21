import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getHealth } from "../api.js";

const features = [
  "تحليل الصفحات",
  "فحص الوصولية",
  "مطابقة المعايير",
  "توثيق المخالفات",
  "تقرير قابل للتصدير",
  "أدلة فنية للعنصر",
  "دعم RTL",
  "تقليل الأخطاء الوهمية"
];

const steps = [
  "إدخال الرابط",
  "تحليل الصفحات",
  "مقارنة المعايير",
  "إنشاء التقرير"
];

export default function LandingPage() {
  const [health, setHealth] = useState("جاري التحقق...");

  useEffect(() => {
    getHealth()
      .then((data) => setHealth(data.message))
      .catch(() => setHealth("تعذر الاتصال بالخادم"));
  }, []);

  return (
    <>
      <section className="hero-section">
        <div className="hero-content">
          <span className="badge badge-primary">تحليل آلي</span>
          <h1>مِعيار</h1>
          <p>
            منصة تحليل تساعد فرق الجودة والامتثال على فحص المواقع الحكومية،
            ومطابقة عناصرها مع كود المنصات، وتوثيق نتائج عدم المطابقة بأدلة فنية قابلة للمراجعة.
          </p>
          <div className="actions">
            <Link className="button primary" to="/scan">
              بدء التحليل
            </Link>
            <Link className="button ghost" to="/rules">
              استعرض المعايير
            </Link>
          </div>
        </div>

        <aside className="hero-card">
          <div className="score-ring" style={{ "--score": 100 }}>
            <span>Real</span>
          </div>
          <h2>جاهزية التحليل</h2>
          <p>النظام جاهز لاستقبال رابط الموقع وبدء عملية المطابقة.</p>
          <div className="mini-metrics">
            <span>DOM</span>
            <span>axe-core</span>
            <span>صور المخالفات</span>
          </div>
        </aside>
      </section>

      <section className="page landing-grid">
        <article className="panel">
          <span className="section-kicker">المشكلة</span>
          <h2>تحدي المراجعة اليدوية</h2>
          <p>
            مراجعة التزام المواقع الحكومية يدويًا تستغرق وقتًا طويلًا، وقد تختلف نتائجها من مراجع لآخر.
          </p>
        </article>
        <article className="panel highlighted-panel">
          <span className="section-kicker">الحل</span>
          <h2>مطابقة منظمة وواضحة</h2>
          <p>
            تقدم مِعيار تقريرًا يوضح حالة كل معيار، ويفصل بين المخالفات المؤكدة، والملاحظات التي تحتاج تحقق، والمعايير غير المطبقة.
          </p>
        </article>
      </section>

      <section className="page">
        <div className="section-heading">
          <span className="section-kicker">المميزات</span>
          <h2>من الفحص إلى التقرير في واجهة واحدة</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="card feature-card" key={feature}>
              <span className="feature-icon">✓</span>
              <strong>{feature}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="page">
        <div className="section-heading">
          <span className="section-kicker">آلية العمل</span>
          <h2>من الرابط إلى التقرير في أربع خطوات</h2>
        </div>
        <div className="steps">
          {steps.map((step, index) => (
            <article className="step-card" key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="page">
        <article className="panel hackathon-panel">
          <span className="section-kicker">قيمة عملية للفريق</span>
          <h2>تحليل واضح يمكن مراجعته وتطويره</h2>
          <div className="hackathon-points">
            <div>
              <strong>تقرير آلي واضح</strong>
              <p>يحوّل المراجعة الطويلة إلى نتائج قابلة للقراءة والتنفيذ.</p>
            </div>
            <div>
              <strong>تحليل متعدد المستويات</strong>
              <p>يفحص على مستوى الصفحة والقسم والعنصر بدل الاكتفاء بنسبة عامة.</p>
            </div>
            <div>
              <strong>قابل للتوسع</strong>
              <p>يعتمد على فحص فعلي للرابط المدخل مع كتالوج معايير قابل للتوسع.</p>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
