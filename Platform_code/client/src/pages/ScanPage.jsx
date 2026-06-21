import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createScan } from "../api.js";

const scanTypes = [
  { label: "فحص سريع", value: "quick" },
  { label: "فحص شامل", value: "full" },
  { label: "فحص الوصولية", value: "accessibility" },
  { label: "فحص المكونات", value: "components" }
];

const loaderSteps = [
  "جمع الصفحات",
  "تحليل عناصر الواجهة",
  "فحص الوصولية",
  "مقارنة المعايير",
  "إنشاء التقرير"
];

export default function ScanPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [scanType, setScanType] = useState("full");
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const interval = setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, loaderSteps.length - 1));
    }, 550);

    return () => clearInterval(interval);
  }, [loading]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setActiveStep(0);

    try {
      const scan = await createScan({ url, scanType });
      await new Promise((resolve) => setTimeout(resolve, 2200));
      navigate(`/results/${scan.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page scan-layout">
      <div>
        <span className="section-kicker">فحص جديد</span>
        <h1 className="page-title">إدخال رابط الموقع</h1>
        <p className="page-lead">
سيتم تحليل الصفحات المتاحة داخل النطاق، ومقارنتها بالمعايير القابلة للفحص آليًا مع توثيق المخالفات المؤكدة بالأدلة.
        </p>

        <form className="panel scan-form" onSubmit={handleSubmit}>
          <label htmlFor="url">رابط الموقع</label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://hmm.gov.sa/"
            required
          />

          <fieldset>
            <legend>نوع الفحص</legend>
            <div className="choice-grid">
              {scanTypes.map((type) => (
                <label className="choice-card" key={type.value}>
                  <input
                    type="radio"
                    name="scanType"
                    value={type.value}
                    checked={scanType === type.value}
                    onChange={(event) => setScanType(event.target.value)}
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button className="button primary wide" type="submit" disabled={loading}>
            {loading ? "جاري الفحص..." : "بدء الفحص"}
          </button>
        </form>
      </div>

      <aside className="panel loader-panel">
        <h2>خطوات الفحص</h2>
        <div className="loader-list">
          {loaderSteps.map((step, index) => (
            <div
              className={`loader-step ${loading && index <= activeStep ? "active" : ""}`}
              key={step}
            >
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
