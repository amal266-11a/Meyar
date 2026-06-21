import { NavLink, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import ScanPage from "./pages/ScanPage.jsx";
import ResultsPage from "./pages/ResultsPage.jsx";
import IssuesPage from "./pages/IssuesPage.jsx";
import IssueDetailsPage from "./pages/IssueDetailsPage.jsx";
import RulesCatalogPage from "./pages/RulesCatalogPage.jsx";

const links = [
  { to: "/", label: "الرئيسية" },
  { to: "/scan", label: "فحص جديد" },
  { to: "/issues", label: "المخالفات" },
  { to: "/rules", label: "كتالوج المعايير" }
];

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/" aria-label="مِعيار">
          <span className="brand-mark">م</span>
          <span>
            <strong>مِعيار</strong>
            <small>منصة تحليل الالتزام بكود المنصات</small>
          </span>
        </NavLink>

        <nav aria-label="التنقل الرئيسي">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/results/:id" element={<ResultsPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/issues/:id" element={<IssueDetailsPage />} />
          <Route path="/rules" element={<RulesCatalogPage />} />
        </Routes>
      </main>
    </div>
  );
}
