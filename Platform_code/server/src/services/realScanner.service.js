import axeCore from "axe-core";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_SRC_DIR = path.resolve(__dirname, "..");
const SERVER_DIR = path.resolve(SERVER_SRC_DIR, "..");
const SCREENSHOTS_ROOT = path.join(SERVER_DIR, "public", "screenshots");

const REAL_SCAN_TIMEOUT_MS = 30000;
const MAX_PAGES_BY_SCAN_TYPE = {
  quick: 1,
  accessibility: 5,
  components: 5,
  full: 8
};
const WEAK_LINK_TEXTS = ["اضغط هنا", "المزيد", "هنا", "click here", "more", "read more"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeName(value = "item") {
  return String(value).replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 80) || "item";
}

async function ensureScreenshotDir(scanId) {
  const dir = path.join(SCREENSHOTS_ROOT, safeName(scanId));
  await mkdir(dir, { recursive: true });
  return dir;
}

async function withBrowser(task) {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: "ar-SA",
      reducedMotion: "reduce"
    });
    const page = await context.newPage();
    page.setDefaultTimeout(REAL_SCAN_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(REAL_SCAN_TIMEOUT_MS);
    return await task(page, context);
  } finally {
    await browser.close();
  }
}

function withTimeout(promise, timeoutMs = REAL_SCAN_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("انتهت مهلة الفحص الحقيقي")), timeoutMs))
  ]);
}

function stripTags(value = "") {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1]?.trim() ?? "";
}

function countMatches(html, pattern) {
  return html.match(pattern)?.length ?? 0;
}

async function screenshotTarget(page, selector, scanId, issueId) {
  const dir = await ensureScreenshotDir(scanId);
  const fileName = `${safeName(issueId)}.png`;
  const filePath = path.join(dir, fileName);
  const publicUrl = `/screenshots/${safeName(scanId)}/${fileName}`;

  try {
    if (selector) {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: "attached", timeout: 2500 });
      const reliableTarget = await locator.evaluate((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const ignored = Boolean(
          el.closest(".owl-item.cloned, .slick-cloned, .swiper-slide-duplicate, [aria-hidden='true'], [hidden]") ||
          el.getAttribute("aria-hidden") === "true" ||
          el.getAttribute("tabindex") === "-1" ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        );
        return !ignored && rect.width >= 8 && rect.height >= 8 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight + 250;
      });
      if (!reliableTarget) return null;
      await locator.scrollIntoViewIfNeeded({ timeout: 2500 });
      await locator.screenshot({ path: filePath, timeout: 3500 });
      return publicUrl;
    }
  } catch {
    // Element screenshots only. A page screenshot would be misleading here.
  }

  // Do not fallback to a generic viewport screenshot. If the element cannot be
  // captured, returning null is more honest than showing an unrelated image.
  return null;
}

function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function escapeAttributeValue(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').slice(0, 80);
}

function extractAttributeFromHtml(html = "", name) {
  const match = String(html).match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return normalizeWhitespace(match?.[1] || "");
}

function simpleSelectorFromEvidence({ selector = "", html = "", text = "", alt = "", href = "", ariaLabel = "", src = "" } = {}) {
  const tag = normalizeWhitespace(String(html).match(/^<\s*([a-z0-9-]+)/i)?.[1] || String(selector).match(/[a-z][a-z0-9-]*/i)?.[0] || "").toLowerCase();
  const id = extractAttributeFromHtml(html, "id");
  if (id && !/^[0-9]/.test(id)) return `${tag || "*"}#${id}`;

  const className = extractAttributeFromHtml(html, "class").split(/\s+/).filter(Boolean).find((item) => !/^active$|^show$|^open$|^selected$/i.test(item));
  if (className) return `${tag || "*"}.${className}`;

  const resolvedAlt = alt || extractAttributeFromHtml(html, "alt");
  if (tag === "img" && resolvedAlt) return `img[alt="${escapeAttributeValue(resolvedAlt)}"]`;

  const resolvedAria = ariaLabel || extractAttributeFromHtml(html, "aria-label");
  if (resolvedAria) return `${tag || "*"}[aria-label="${escapeAttributeValue(resolvedAria)}"]`;

  const resolvedHref = href || extractAttributeFromHtml(html, "href");
  if (tag === "a" && resolvedHref) return `a[href="${escapeAttributeValue(resolvedHref)}"]`;

  const resolvedSrc = src || extractAttributeFromHtml(html, "src");
  if (tag === "img" && resolvedSrc) return `img[src="${escapeAttributeValue(resolvedSrc)}"]`;

  const last = String(selector).split(">").map((part) => part.trim()).filter(Boolean).pop();
  return last?.replace(/:nth-of-type\(\d+\)/g, "") || tag || selector || "";
}

function isPluginLikeEvidence(value = "") {
  return /owl-stage|owl-item|owl-|owl-carousel|carousel|slider|slick|swiper|splide|cloned|clone|prev|next|data-slide|data-bs-slide/i.test(String(value));
}

function mapAxeRule(violationId = "") {
  const id = violationId.toLowerCase();
  if (id.includes("color-contrast")) return { ruleCode: "COLOR-002", componentType: "التباين", severity: "عالية" };
  if (id.includes("image-alt")) return { ruleCode: "A11Y-001", componentType: "الصور", severity: "عالية" };
  if (id.includes("button-name")) return { ruleCode: "BTN-001", componentType: "الأزرار", severity: "متوسطة" };
  if (id.includes("label")) return { ruleCode: "FORM-001", componentType: "النماذج", severity: "حرجة" };
  if (id.includes("link-name")) return { ruleCode: "LINK-001", componentType: "الروابط", severity: "متوسطة" };
  if (id.includes("heading")) return { ruleCode: "A11Y-003", componentType: "العناوين", severity: "متوسطة" };
  if (id.includes("landmark") || id.includes("region")) return { ruleCode: "A11Y-004", componentType: "المعالم الدلالية", severity: "متوسطة" };
  return { ruleCode: "A11Y-005", componentType: "الوصولية", severity: "عالية" };
}

function severityFromImpact(impact, fallback = "متوسطة") {
  if (impact === "critical") return "حرجة";
  if (impact === "serious") return "عالية";
  if (impact === "moderate") return "متوسطة";
  if (impact === "minor") return "منخفضة";
  return fallback;
}

function getStatus(score) {
  if (score >= 90) return "مطابق بدرجة عالية";
  if (score >= 75) return "جيد";
  if (score >= 60) return "يحتاج تحسين";
  return "غير مطابق";
}

function calculatePageScore(issues) {
  // Page score is intentionally severity-based and capped by unique rule,
  // so duplicate findings do not make strong government sites look unfairly weak.
  const strongestByRule = new Map();
  const rank = { "حرجة": 4, "عالية": 3, "متوسطة": 2, "منخفضة": 1 };
  for (const issue of issues.filter((item) => item.confidence !== "low")) {
    const key = issue.ruleCode || issue.axeId || issue.title;
    const current = strongestByRule.get(key);
    if (!current || (rank[issue.severity] || 1) > (rank[current.severity] || 1)) {
      strongestByRule.set(key, issue);
    }
  }
  const deduction = [...strongestByRule.values()].reduce((sum, issue) => {
    if (issue.severity === "حرجة") return sum + 10;
    if (issue.severity === "عالية") return sum + 6;
    if (issue.severity === "متوسطة") return sum + 3;
    return sum + 1;
  }, 0);
  return clamp(100 - deduction, 0, 100);
}

function buildCssPath(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const id = current.getAttribute("id");
    if (id && !/^[0-9]/.test(id)) {
      parts.unshift(`${tag}#${CSS.escape(id)}`);
      break;
    }
    const className = String(current.className || "").split(/\s+/).filter(Boolean)[0];
    let part = className ? `${tag}.${CSS.escape(className)}` : tag;
    const parent = current.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
      if (sameTag.length > 1) {
        const index = sameTag.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}

async function collectDomSummary(page) {
  return page.evaluate((weakTexts) => {
    const cssPath = (element) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
        const tag = current.tagName.toLowerCase();
        const id = current.getAttribute("id");
        if (id && !/^[0-9]/.test(id)) {
          parts.unshift(`${tag}#${CSS.escape(id)}`);
          break;
        }
        const className = String(current.className || "").split(/\s+/).filter(Boolean)[0];
        let part = className ? `${tag}.${CSS.escape(className)}` : tag;
        const parent = current.parentElement;
        if (parent) {
          const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
          if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(" > ");
    };

    const getAccessibleName = (el) => {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const label = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || "").join(" ").trim();
        if (label) return label;
      }
      const childAlt = [...el.querySelectorAll("img[alt], svg title")].map((child) => child.getAttribute("alt") || child.textContent || "").join(" ");
      const hiddenText = [...el.querySelectorAll(".sr-only, .visually-hidden, [class*='sr-only'], [class*='visually-hidden']")].map((child) => child.textContent || "").join(" ");
      const pseudoBefore = getComputedStyle(el, "::before").content?.replace(/^["']|["']$/g, "");
      const pseudoAfter = getComputedStyle(el, "::after").content?.replace(/^["']|["']$/g, "");
      return [el.getAttribute("aria-label"), el.getAttribute("title"), el.innerText, el.textContent, el.value, childAlt, hiddenText, pseudoBefore, pseudoAfter]
        .filter((value) => value && value !== "none" && value !== "normal")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const isIgnoredElement = (el) => {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return true;
      const style = getComputedStyle(el);
      return Boolean(
        el.disabled ||
        el.hidden ||
        el.getAttribute("aria-hidden") === "true" ||
        el.getAttribute("tabindex") === "-1" ||
        el.closest("[aria-hidden='true'], [hidden], .owl-item.cloned, .slick-cloned, .swiper-slide-duplicate, .swiper-slide-duplicate-active, .swiper-slide-duplicate-next, .swiper-slide-duplicate-prev") ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      );
    };

    const hasDigitalStampContext = (el) => {
      const stamp = el?.closest?.("[class*='digital-stamp'], [class*='stamp'], .btn-digital-stamp-card, .digital-stamp-header");
      const text = [
        el?.innerText,
        el?.textContent,
        stamp?.innerText,
        stamp?.textContent,
        el?.className,
        stamp?.className
      ].join(" ");
      return /موقع حكومي مسجل لدى هيئة الحكومة الرقمية|هيئة الحكومة الرقمية|كيف تتحقق|الختم الرقمي|digital-stamp|stamp-title|btn-digital-stamp/i.test(text);
    };

    const getNearestCardTitle = (el) => {
      const card = el?.closest?.(".card, [class*='card'], article, [role='article']");
      if (!card) return "";
      const title = card.querySelector("h1,h2,h3,h4,h5,h6,[class*='title'],[aria-label]");
      return (title?.innerText || title?.textContent || title?.getAttribute?.("aria-label") || "").replace(/\s+/g, " ").trim();
    };

    const isContextualCardAction = (el) => {
      const tag = el?.tagName?.toLowerCase?.() || "";
      if (!['a', 'button'].includes(tag) && el?.getAttribute?.('role') !== 'button') return false;
      const cardTitle = getNearestCardTitle(el);
      if (!cardTitle) return false;
      const ownName = getAccessibleName(el);
      const rect = el.getBoundingClientRect();
      const hasArrowOrIcon = /←|→|‹|›|arrow|icon|chevron|btn|dga-btn/i.test([el.innerText, el.className, el.outerHTML].join(' '));
      return rect.width > 0 && rect.height > 0 && (hasArrowOrIcon || !ownName);
    };

    const getElementContext = (el) => {
      const contextElement = el?.closest?.("[class], [id], [data-slide], [data-bs-slide], [aria-roledescription]");
      const context = [
        el?.className,
        el?.id,
        contextElement?.className,
        contextElement?.id,
        el?.getAttribute?.("data-slide"),
        el?.getAttribute?.("data-bs-slide"),
        el?.getAttribute?.("aria-roledescription"),
        contextElement?.getAttribute?.("aria-roledescription")
      ].join(" ").toLowerCase();
      return {
        text: context,
        isCarousel: /owl-carousel|owl-stage|owl-stage-outer|owl-item|owl-nav|owl-prev|owl-next|carousel|carousel-item|slick-slider|slick-track|slick-slide|swiper|swiper-slide|swiper-button-next|swiper-button-prev|slider|slide|splide|data-slide|data-bs-slide/.test(context),
        isClone: /cloned|clone|slick-cloned|swiper-slide-duplicate/.test(context),
        isControl: /owl-prev|owl-next|swiper-button-next|swiper-button-prev|prev|next|arrow|control/.test(context),
        isDigitalStamp: hasDigitalStampContext(el),
        isContextualCardAction: isContextualCardAction(el),
        cardTitle: getNearestCardTitle(el)
      };
    };

    const isCarouselOrSliderElement = (el) => getElementContext(el).isCarousel;
    const isGeneratedCarouselClone = (el) => getElementContext(el).isClone || Boolean(el?.closest?.(".owl-item.cloned, .slick-cloned, .swiper-slide-duplicate"));
    const isDecorativeOrPluginControl = (el) => {
      const context = getElementContext(el);
      return context.isControl || Boolean(el?.closest?.(".owl-nav, .slick-arrow, .swiper-button-next, .swiper-button-prev"));
    };
    const isSafeToReportAsIssue = (el, ruleId) => {
      const context = getElementContext(el);
      if (isIgnoredElement(el) || isGeneratedCarouselClone(el)) return false;
      if (context.isDigitalStamp && ["A11Y-004", "LINK-001", "BTN-001", "A11Y-002"].includes(ruleId)) return false;
      if (context.isContextualCardAction && ["LINK-001", "BTN-001", "A11Y-002"].includes(ruleId)) return false;
      if (["LINK-001", "BTN-001", "A11Y-002", "A11Y-003", "A11Y-004", "RESP-001"].includes(ruleId) && isCarouselOrSliderElement(el)) return false;
      if (isDecorativeOrPluginControl(el)) return false;
      return true;
    };

    const isMeaningfulHeading = (heading) => {
      if (!isSafeToReportAsIssue(heading, "A11Y-003")) return false;
      if (heading.closest("footer, header, nav, .owl-item.cloned, .slick-cloned, .swiper-slide-duplicate")) return false;
      const text = (heading.innerText || heading.textContent || "").trim();
      const rect = heading.getBoundingClientRect();
      return text.length > 0 && rect.width > 0 && rect.height > 0;
    };

    const hasOnlyWeakVisibleText = (link) => {
      const visibleText = (link.innerText || "").trim().toLowerCase();
      const accessibleName = getAccessibleName(link).trim().toLowerCase();
      return weakTexts.some((text) => visibleText === text.toLowerCase()) && accessibleName === visibleText;
    };

    const isUnnamedIconControl = (el) => {
      if (!isSafeToReportAsIssue(el, "A11Y-002")) return false;
      const text = (el.innerText || "").replace(/\s+/g, "").trim();
      const hasIcon = Boolean(el.querySelector("svg, i, img, [class*='icon'], [class*='arrow']"));
      return hasIcon && !text && !getAccessibleName(el);
    };

    const simpleSelector = (el) => {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = el.tagName.toLowerCase();
      const id = el.getAttribute("id");
      if (id && !/^[0-9]/.test(id)) return `${tag}#${CSS.escape(id)}`;
      const stableClass = String(el.className || "").split(/\s+/).filter(Boolean).find((item) => !/^(active|show|open|selected|fade|collapse)$/i.test(item));
      if (stableClass) return `${tag}.${CSS.escape(stableClass)}`;
      const alt = el.getAttribute("alt");
      if (tag === "img" && alt) return `img[alt="${CSS.escape(alt)}"]`;
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
      return tag;
    };

    const html = document.documentElement;
    const allImages = [...document.querySelectorAll("img")];
    const allButtons = [...document.querySelectorAll("button, [role='button']")]
      .filter((el) => !isIgnoredElement(el) && !el.hasAttribute("disabled") && el.offsetParent !== null);
    const allInputs = [...document.querySelectorAll("input:not([type='hidden']), textarea, select")]
      .filter((el) => el.offsetParent !== null);
    const allLinks = [...document.querySelectorAll("a[href]")].filter((el) => !isIgnoredElement(el) && el.offsetParent !== null);
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(isMeaningfulHeading);
    const structuralHeadings = headings.filter((heading) => !heading.closest(".card, [class*='card'], [role='article']") || heading.tagName === "H1");
    const tables = [...document.querySelectorAll("table")];

    const inputHasLabel = (input) => {
      const id = input.getAttribute("id");
      return Boolean(
        input.getAttribute("aria-label") ||
        input.getAttribute("aria-labelledby") ||
        input.getAttribute("title") ||
        input.closest("label") ||
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`))
      );
    };

    const weakLinks = allLinks.filter((link) => isSafeToReportAsIssue(link, "LINK-001") && hasOnlyWeakVisibleText(link));
    const imagesWithoutAlt = allImages.filter((img) => !img.hasAttribute("alt"));
    const buttonsWithoutText = allButtons.filter((button) => isSafeToReportAsIssue(button, "BTN-001") && !getAccessibleName(button));
    const inputsWithoutLabel = allInputs.filter((input) => !inputHasLabel(input));
    const emptyHeadings = headings.filter((heading) => !heading.innerText.trim());
    const tablesWithoutHeaders = tables.filter((table) => !table.querySelector("th, [role='columnheader'], [role='rowheader']"));
    let previousLevel = 0;
    let headingOrderLooksValid = true;
    let headingOrderExample = null;
    for (const heading of structuralHeadings) {
      const level = Number(heading.tagName.replace("H", ""));
      if (previousLevel !== 0 && level > previousLevel + 1) {
        headingOrderLooksValid = false;
        headingOrderExample = heading;
        break;
      }
      previousLevel = level;
    }

    const linkText = (selector) => Boolean(document.querySelector(selector));
    const pageText = document.body.innerText || "";
    const hasHeader = Boolean(document.querySelector("header, [role='banner']"));
    const hasFooter = Boolean(document.querySelector("footer, [role='contentinfo']"));
    const hasMain = Boolean(document.querySelector("main, [role='main']"));
    const hasNav = Boolean(document.querySelector("nav, [role='navigation']"));
    const hasPrivacyLink = allLinks.some((a) => /privacy|سياسة الخصوصية|الخصوصية/i.test(a.href + " " + a.innerText));
    const hasTermsLink = allLinks.some((a) => /terms|الشروط|الاستخدام|إخلاء|سياسات/i.test(a.href + " " + a.innerText));
    const hasContactLink = allLinks.some((a) => /contact|تواصل|اتصل|الدعم|بلاغ/i.test(a.href + " " + a.innerText));
    const hasSitemapLink = allLinks.some((a) => /sitemap|خريطة الموقع/i.test(a.href + " " + a.innerText));
    const hasSearch = Boolean(document.querySelector("input[type='search'], input[placeholder*='بحث'], button[aria-label*='بحث'], [role='search']")) || /بحث/.test(pageText);
    const hasServicesLink = allLinks.some((a) => /service|services|خدمات|الخدمات/i.test(a.href + " " + a.innerText));
    const hasAccessibilityTools = /الوصولية|إمكانية الوصول|تباين|حجم الخط|accessibility/i.test(pageText);
    const hasDigitalStamp = /الختم الرقمي|digital stamp|موثق|التحقق من الموقع|dga|موقع حكومي مسجل لدى هيئة الحكومة الرقمية|هيئة الحكومة الرقمية|كيف تتحقق/i.test(pageText);
    const hasOwnerIdentity = Boolean(document.querySelector("img[alt*='شعار'], img[alt*='أمانة'], img[alt*='جامعة'], header img")) || document.title.trim().length > 3;

    const bodyStyle = getComputedStyle(document.body);
    const fontFamily = bodyStyle.fontFamily || "";

    const cards = [...document.querySelectorAll(".card, [class*='card'], article, [role='article']")].filter((el) => el.offsetParent !== null);
    const cardsWithoutTitle = cards.filter((card) => !card.querySelector("h1,h2,h3,h4,h5,h6,[class*='title'],[aria-label]") && !(card.innerText || "").trim().slice(0, 80));
    const visibleButtonsAndLinks = [...document.querySelectorAll("button, [role='button'], a[href]")].filter((el) => !isIgnoredElement(el) && el.offsetParent !== null);
    const smallTapTargets = visibleButtonsAndLinks.filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32);
    });
    const hasBreadcrumb = Boolean(document.querySelector("nav[aria-label*='breadcrumb' i], nav[aria-label*='مسار'], .breadcrumb, [class*='breadcrumb']"));
    const alertElements = [...document.querySelectorAll("[role='alert'], .alert, [class*='alert'], [class*='toast'], [class*='notification']")].filter((el) => el.offsetParent !== null);
    const unclearAlerts = alertElements.filter((el) => !(el.innerText || el.getAttribute("aria-label") || "").trim());
    const modals = [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], .modal, [class*='modal']")].filter((el) => el.offsetParent !== null);
    const modalsWithoutLabels = modals.filter((el) => !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !el.querySelector("h1,h2,h3,h4,h5,h6"));
    const tabs = [...document.querySelectorAll("[role='tab'], .tab, [class*='tabs']")].filter((el) => el.offsetParent !== null);
    const tabsWithoutAria = tabs.filter((el) => el.matches("[role='tab']") && !el.hasAttribute("aria-selected"));
    const accordions = [...document.querySelectorAll("[aria-expanded], .accordion, [class*='accordion'], [data-toggle='collapse']")].filter((el) => el.offsetParent !== null);
    const accordionsWithoutState = accordions.filter((el) => !el.hasAttribute("aria-expanded") && !el.querySelector("[aria-expanded]"));
    const paginations = [...document.querySelectorAll("nav[aria-label*='pagination' i], nav[aria-label*='صفحات'], .pagination, [class*='pagination']")].filter((el) => el.offsetParent !== null);
    const paginationWithoutCurrent = paginations.filter((el) => !el.querySelector("[aria-current], .active, [class*='active']"));
    const iconsInteractive = visibleButtonsAndLinks.filter(isUnnamedIconControl);
    const hasReducedMotionCss = [...document.styleSheets].some((sheet) => {
      try { return [...sheet.cssRules].some((rule) => String(rule.cssText || "").includes("prefers-reduced-motion")); }
      catch { return false; }
    });
    const hasServiceDescription = /وصف الخدمة|عن الخدمة|نبذة|تفاصيل الخدمة|الخدمة/i.test(pageText);
    const hasBeneficiaryInfo = /المستفيد|الفئة المستهدفة|الأفراد|الأعمال|الجهات الحكومية/i.test(pageText);
    const hasRequirementsInfo = /المتطلبات|الشروط|المستندات|الوثائق المطلوبة/i.test(pageText);
    const hasDurationInfo = /مدة|أيام عمل|ساعات|زمن التنفيذ|وقت التنفيذ/i.test(pageText);
    const hasChannelsInfo = /قنوات|تطبيق|البوابة|مركز الاتصال|حضوري|إلكتروني/i.test(pageText);
    const hasLastUpdated = /آخر تحديث|تاريخ التحديث|تم التحديث/i.test(pageText);
    const longTextBlocks = [...document.querySelectorAll("p, li")].filter((el) => (el.innerText || "").trim().length > 220);
    const imageSizingIssues = allImages.filter((img) => {
      const rect = img.getBoundingClientRect();
      const widthAttr = Number(img.getAttribute("width") || 0);
      const heightAttr = Number(img.getAttribute("height") || 0);
      return rect.width > 0 && (!widthAttr || !heightAttr);
    });
    const cssFilesCount = document.querySelectorAll("link[rel='stylesheet']").length;
    const scriptFilesCount = document.querySelectorAll("script[src]").length;
    const inlineStyleCount = document.querySelectorAll("[style]").length;
    const fontDisplayDetected = [...document.styleSheets].some((sheet) => {
      try { return [...sheet.cssRules].some((rule) => /font-display\s*:/i.test(String(rule.cssText || ""))); }
      catch { return false; }
    });

    const summarize = (el) => ({
      selector: cssPath(el),
      simpleSelector: simpleSelector(el),
      html: el.outerHTML.slice(0, 600),
      text: (el.innerText || el.getAttribute("alt") || el.getAttribute("placeholder") || "").trim().slice(0, 200),
      alt: el.getAttribute("alt") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      href: el.getAttribute("href") || "",
      src: el.getAttribute("src") || "",
      id: el.getAttribute("id") || "",
      name: el.getAttribute("name") || "",
      placeholder: el.getAttribute("placeholder") || "",
      context: getElementContext(el)
    });

    return {
      title: document.title,
      finalUrl: location.href,
      lang: html.getAttribute("lang") || "",
      dir: html.getAttribute("dir") || "",
      fontFamily,
      linksCount: allLinks.length,
      imagesCount: allImages.length,
      buttonsCount: allButtons.length,
      inputsCount: allInputs.length,
      headingsCount: headings.length,
      tablesCount: tables.length,
      hasLangAr: /^ar\b/i.test(html.getAttribute("lang") || ""),
      hasRtl: (html.getAttribute("dir") || "").toLowerCase() === "rtl",
      hasH1: headings.some((h) => h.tagName === "H1"),
      headingOrderLooksValid,
      hasHeader,
      hasFooter,
      hasMain,
      hasNav,
      hasPrivacyLink,
      hasTermsLink,
      hasContactLink,
      hasSitemapLink,
      hasSearch,
      hasServicesLink,
      hasAccessibilityTools,
      hasDigitalStamp,
      hasOwnerIdentity,
      usesApprovedArabicFont: /IBM Plex Sans Arabic|IBM Plex|Noto Kufi|Tajawal|DINNext|sans-serif/i.test(fontFamily),
      cardsCount: cards.length,
      cardsWithoutTitleCount: cardsWithoutTitle.length,
      smallTapTargetsCount: smallTapTargets.length,
      hasBreadcrumb,
      alertsCount: alertElements.length,
      unclearAlertsCount: unclearAlerts.length,
      modalsCount: modals.length,
      modalsWithoutLabelsCount: modalsWithoutLabels.length,
      tabsCount: tabs.length,
      tabsWithoutAriaCount: tabsWithoutAria.length,
      accordionsCount: accordions.length,
      accordionsWithoutStateCount: accordionsWithoutState.length,
      paginationsCount: paginations.length,
      paginationWithoutCurrentCount: paginationWithoutCurrent.length,
      iconInteractiveMissingNameCount: iconsInteractive.length,
      hasReducedMotionCss,
      hasServiceDescription,
      hasBeneficiaryInfo,
      hasRequirementsInfo,
      hasDurationInfo,
      hasChannelsInfo,
      hasLastUpdated,
      longTextBlocksCount: longTextBlocks.length,
      imageSizingIssuesCount: imageSizingIssues.length,
      cssFilesCount,
      scriptFilesCount,
      inlineStyleCount,
      fontDisplayDetected,
      imagesWithoutAltCount: imagesWithoutAlt.length,
      buttonsWithoutTextCount: buttonsWithoutText.length,
      inputsWithoutLabelCount: inputsWithoutLabel.length,
      linksWithWeakTextCount: weakLinks.length,
      emptyHeadingsCount: emptyHeadings.length,
      tablesWithoutHeadersCount: tablesWithoutHeaders.length,
      imagesWithoutAltExamples: imagesWithoutAlt.slice(0, 5).map(summarize),
      buttonsWithoutTextExamples: buttonsWithoutText.slice(0, 5).map(summarize),
      inputsWithoutLabelExamples: inputsWithoutLabel.slice(0, 5).map(summarize),
      linksWithWeakTextExamples: weakLinks.slice(0, 5).map(summarize),
      emptyHeadingsExamples: emptyHeadings.slice(0, 5).map(summarize),
      tablesWithoutHeadersExamples: tablesWithoutHeaders.slice(0, 5).map(summarize),
      headingOrderExample: headingOrderExample ? summarize(headingOrderExample) : null
    };
  }, WEAK_LINK_TEXTS);
}

async function collectResponsiveSummary(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const summary = await page.evaluate(() => {
    const doc = document.documentElement;
    const getElementContext = (el) => {
      const contextElement = el?.closest?.("[class], [id], [data-slide], [data-bs-slide], [aria-roledescription]");
      const context = [
        el?.className,
        el?.id,
        contextElement?.className,
        contextElement?.id,
        el?.getAttribute?.("data-slide"),
        el?.getAttribute?.("data-bs-slide"),
        el?.getAttribute?.("aria-roledescription"),
        contextElement?.getAttribute?.("aria-roledescription")
      ].join(" ").toLowerCase();
      return {
        text: context,
        isCarousel: /owl-carousel|owl-stage|owl-stage-outer|owl-item|owl-nav|owl-prev|owl-next|carousel|carousel-inner|carousel-item|slick-slider|slick-track|slick-slide|swiper|swiper-wrapper|swiper-slide|swiper-button-next|swiper-button-prev|slider|slide|splide|data-slide|data-bs-slide/.test(context),
        isClone: /cloned|clone|slick-cloned|swiper-slide-duplicate/.test(context)
      };
    };
    const isCarouselOrSliderElement = (el) => getElementContext(el).isCarousel;
    const isGeneratedCarouselClone = (el) => getElementContext(el).isClone || Boolean(el?.closest?.(".owl-item.cloned, .slick-cloned, .swiper-slide-duplicate"));
    const overflowElements = [...document.body.querySelectorAll("body *")]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.right > window.innerWidth + 16 && !isCarouselOrSliderElement(el) && !isGeneratedCarouselClone(el);
      })
      .slice(0, 5)
      .map((el) => {
        const cssPath = (element) => {
          const parts = [];
          let current = element;
          while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
            const tag = current.tagName.toLowerCase();
            const id = current.getAttribute("id");
            if (id && !/^[0-9]/.test(id)) {
              parts.unshift(`${tag}#${CSS.escape(id)}`);
              break;
            }
            const className = String(current.className || "").split(/\s+/).filter(Boolean)[0];
            let part = className ? `${tag}.${CSS.escape(className)}` : tag;
            const parent = current.parentElement;
            if (parent) {
              const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
              if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
            }
            parts.unshift(part);
            current = parent;
          }
          return parts.join(" > ");
        };
        return {
          selector: cssPath(el),
          html: el.outerHTML.slice(0, 600),
          width: Math.round(el.getBoundingClientRect().width),
          right: Math.round(el.getBoundingClientRect().right),
          context: getElementContext(el)
        };
      });

    return {
      viewportWidth: window.innerWidth,
      scrollWidth: doc.scrollWidth,
      hasHorizontalOverflow: doc.scrollWidth > window.innerWidth + 16 && overflowElements.length > 0,
      overflowElements
    };
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  return summary;
}

async function runAxeOnCurrentPage(page) {
  await page.addScriptTag({ content: axeCore.source });
  const results = await page.evaluate(async () => window.axe.run(document));
  return {
    violationsCount: results.violations.length,
    passesCount: results.passes.length,
    incompleteCount: results.incomplete.length,
    violations: results.violations.slice(0, 12).map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodesCount: violation.nodes.length,
      nodes: violation.nodes.slice(0, 3).map((node) => ({
        target: node.target,
        html: node.html,
        text: node.any?.[0]?.message || "",
        failureSummary: node.failureSummary,
        impact: violation.impact,
        help: violation.help,
        description: violation.description
      }))
    }))
  };
}

function createIssueBase({ scanId, pageId, pageName, pageUrl, ruleCode, ruleName, componentType, title, description, severity, reason, recommendation, selector, simpleSelector, htmlSnippet, evidence, evidenceDetails, source, screenshotUrl, axeId, confidence = "high", occurrences = 1 }) {
  const id = `real-${safeName(ruleCode)}-${safeName(pageId)}-${Math.random().toString(36).slice(2, 8)}`;
  const derivedSimpleSelector = simpleSelector || simpleSelectorFromEvidence({
    selector,
    html: htmlSnippet,
    text: evidenceDetails?.text,
    alt: evidenceDetails?.alt,
    href: evidenceDetails?.href,
    ariaLabel: evidenceDetails?.ariaLabel,
    src: evidenceDetails?.src
  });
  return {
    id,
    scanId,
    pageId,
    pageName,
    pageUrl,
    elementType: componentType,
    componentType,
    ruleId: ruleCode,
    ruleCode,
    ruleName,
    title,
    description,
    severity,
    status: "مفتوح",
    reason,
    recommendation,
    found: evidence || description,
    why: reason,
    fix: recommendation,
    before: htmlSnippet || selector || "",
    after: recommendation,
    code: recommendation,
    componentSelector: selector,
    selector,
    fullSelector: selector,
    simpleSelector: derivedSimpleSelector,
    htmlSnippet,
    evidence,
    evidenceDetails,
    source,
    axeId,
    confidence,
    occurrences,
    screenshotUrl,
    screenshotCaptured: Boolean(screenshotUrl),
    screenshotKind: screenshotUrl ? "element" : null
  };
}

async function issueWithScreenshot(page, issueInput) {
  const id = `real-${safeName(issueInput.ruleCode)}-${safeName(issueInput.pageId)}-${safeName(issueInput.selector || issueInput.title)}`;
  const context = issueInput.evidenceDetails?.context || {};
  const pluginLike = context.isCarousel || context.isClone || context.isControl || isPluginLikeEvidence(`${issueInput.selector || ""} ${issueInput.simpleSelector || ""} ${issueInput.htmlSnippet || ""}`);
  const confidence = pluginLike && ["LINK-001", "BTN-001", "A11Y-002", "A11Y-003", "A11Y-004", "RESP-001"].includes(issueInput.ruleCode)
    ? "low"
    : issueInput.confidence;
  const screenshotUrl = confidence === "low" || pluginLike
    ? null
    : await screenshotTarget(page, issueInput.selector, issueInput.scanId, id);
  return createIssueBase({ ...issueInput, confidence, screenshotUrl });
}

async function validateAxeNode(page, violation, selector) {
  if (!selector) return { report: false, confidence: "low", reason: "لا يوجد selector موثوق للعقدة." };

  try {
    const result = await page.locator(selector).first().evaluate((el, violationId) => {
      const normalize = (value = "") => String(value).replace(/\s+/g, " ").trim();
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const getAccessibleName = (node) => {
        const labelledBy = node.getAttribute("aria-labelledby");
        if (labelledBy) {
          const label = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || "").join(" ");
          if (normalize(label)) return normalize(label);
        }
        const childAlt = [...node.querySelectorAll("img[alt], svg title")].map((child) => child.getAttribute("alt") || child.textContent || "").join(" ");
        const hiddenText = [...node.querySelectorAll(".sr-only, .visually-hidden, [class*='sr-only'], [class*='visually-hidden']")].map((child) => child.textContent || "").join(" ");
        const pseudoBefore = getComputedStyle(node, "::before").content?.replace(/^["']|["']$/g, "");
        const pseudoAfter = getComputedStyle(node, "::after").content?.replace(/^["']|["']$/g, "");
        return normalize([node.getAttribute("aria-label"), node.getAttribute("title"), node.innerText, node.textContent, node.value, childAlt, hiddenText, pseudoBefore, pseudoAfter]
          .filter((value) => value && value !== "none" && value !== "normal")
          .join(" "));
      };
      const ignored = Boolean(
        el.disabled ||
        el.hidden ||
        el.getAttribute("aria-hidden") === "true" ||
        el.getAttribute("tabindex") === "-1" ||
        el.closest("[aria-hidden='true'], [hidden], .owl-item.cloned, .slick-cloned, .swiper-slide-duplicate, .swiper-slide-duplicate-active, .swiper-slide-duplicate-next, .swiper-slide-duplicate-prev") ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        rect.width <= 0 ||
        rect.height <= 0
      );
      const hasDigitalStampContext = (node) => {
        const stamp = node?.closest?.("[class*='digital-stamp'], [class*='stamp'], .btn-digital-stamp-card, .digital-stamp-header");
        const text = [node?.innerText, node?.textContent, stamp?.innerText, stamp?.textContent, node?.className, stamp?.className].join(" ");
        return /موقع حكومي مسجل لدى هيئة الحكومة الرقمية|هيئة الحكومة الرقمية|كيف تتحقق|الختم الرقمي|digital-stamp|stamp-title|btn-digital-stamp/i.test(text);
      };
      const getNearestCardTitle = (node) => {
        const card = node?.closest?.(".card, [class*='card'], article, [role='article']");
        if (!card) return "";
        const title = card.querySelector("h1,h2,h3,h4,h5,h6,[class*='title'],[aria-label]");
        return normalize(title?.innerText || title?.textContent || title?.getAttribute?.("aria-label") || "");
      };
      const isContextualCardAction = (node) => {
        const tag = node?.tagName?.toLowerCase?.() || "";
        if (!["a", "button"].includes(tag) && node?.getAttribute?.("role") !== "button") return false;
        const cardTitle = getNearestCardTitle(node);
        if (!cardTitle) return false;
        const ownName = getAccessibleName(node);
        const looksLikeAction = /←|→|‹|›|arrow|icon|chevron|btn|dga-btn/i.test([node.innerText, node.className, node.outerHTML].join(" "));
        return looksLikeAction || !ownName;
      };
      const getElementContext = (node) => {
        const contextElement = node?.closest?.("[class], [id], [data-slide], [data-bs-slide], [aria-roledescription]");
        const context = [
          node?.className,
          node?.id,
          contextElement?.className,
          contextElement?.id,
          node?.getAttribute?.("data-slide"),
          node?.getAttribute?.("data-bs-slide"),
          node?.getAttribute?.("aria-roledescription"),
          contextElement?.getAttribute?.("aria-roledescription")
        ].join(" ").toLowerCase();
        return {
          text: context,
          isCarousel: /owl-carousel|owl-stage|owl-stage-outer|owl-item|owl-nav|owl-prev|owl-next|carousel|carousel-item|slick-slider|slick-track|slick-slide|swiper|swiper-slide|swiper-button-next|swiper-button-prev|slider|slide|splide|data-slide|data-bs-slide/.test(context),
          isClone: /cloned|clone|slick-cloned|swiper-slide-duplicate/.test(context),
          isControl: /owl-prev|owl-next|swiper-button-next|swiper-button-prev|prev|next|arrow|control/.test(context),
          isDigitalStamp: hasDigitalStampContext(node),
          isContextualCardAction: isContextualCardAction(node),
          cardTitle: getNearestCardTitle(node)
        };
      };
      const context = getElementContext(el);
      const carouselLike = context.isCarousel || context.isControl;
      const smallWidget = rect.width < 80 && rect.height < 80;
      const inChrome = Boolean(el.closest("header, footer, nav, aside, [role='complementary']"));
      const name = getAccessibleName(el) || (context.isContextualCardAction ? context.cardTitle : "");
      const meaningfulHeading = /^h[1-6]$/i.test(el.tagName) && !inChrome && !el.closest(".card, [class*='card'], [role='article']") && normalize(el.innerText || el.textContent).length > 0;
      return { ignored, name, carouselLike, smallWidget, inChrome, meaningfulHeading, tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || "", context };
    }, violation.id);

    if (result.ignored) return { report: false, confidence: "low", reason: "العنصر مخفي أو مستنسخ أو زخرفي." };
    if ((violation.id === "region" || violation.id.includes("landmark")) && result.context?.isDigitalStamp) {
      return { report: false, confidence: "low", reason: "الختم الرقمي الحكومي مكوّن رسمي شائع ولا يُعرض كمخالفة مؤكدة." };
    }
    if ((violation.id === "link-name" || violation.id === "button-name") && result.context?.isContextualCardAction) {
      return { report: false, confidence: "low", reason: "الرابط/الزر داخل بطاقة لها عنوان واضح، لذلك لا يُعد مخالفة مؤكدة." };
    }
    if (violation.id.includes("heading-order") && result.context?.cardTitle) {
      return { report: true, confidence: "low", reason: "ملاحظة تحتاج تحقق: العنوان داخل بطاقة سياقية وقد لا يمثل خللًا مؤكدًا في بنية الصفحة.", context: result.context };
    }
    if (result.context?.isClone) {
      return { report: true, confidence: "low", reason: "ملاحظة تحتاج تحقق: العنصر داخل نسخة مكررة من سلايدر/كروسيل ولا يُعد مخالفة مؤكدة.", context: result.context };
    }
    if (["region", "scrollable-region-focusable"].includes(violation.id) && result.carouselLike) {
      return { report: true, confidence: "low", reason: "ملاحظة تحتاج تحقق: العنصر داخل بنية سلايدر/كروسيل، لذلك لا يُعرض كمخالفة مؤكدة.", context: result.context };
    }
    if (violation.id.includes("landmark") && result.role === "contentinfo") {
      return { report: true, confidence: "low", reason: "ملاحظة تحتاج تحقق: تكرار contentinfo غالبًا من قالب تذييل/قسم متكرر، لذلك لا يُعرض كمخالفة مؤكدة.", context: result.context };
    }
    if (violation.id.includes("heading") && result.carouselLike) {
      return { report: true, confidence: "low", reason: "ملاحظة تحتاج تحقق: عنوان داخل سلايدر/قالب ديناميكي.", context: result.context };
    }
    if ((violation.id === "link-name" || violation.id === "button-name") && result.name) {
      return { report: false, confidence: "high", reason: "للعنصر اسم قابل للوصول من DOM." };
    }
    if ((violation.id === "link-name" || violation.id === "button-name") && result.smallWidget) {
      const before = await page.evaluate(() => ({
        url: location.href,
        active: document.querySelectorAll(".active, .swiper-slide-active, .slick-active, [aria-expanded='true']").length,
        scrollX,
        scrollY,
        text: (document.body.innerText || "").slice(0, 2000)
      }));
      try {
        await page.locator(selector).first().click({ timeout: 1200, trial: false });
        await page.waitForTimeout(350);
        const after = await page.evaluate(() => ({
          url: location.href,
          active: document.querySelectorAll(".active, .swiper-slide-active, .slick-active, [aria-expanded='true']").length,
          scrollX,
          scrollY,
          text: (document.body.innerText || "").slice(0, 2000)
        }));
        const changed = before.url !== after.url || before.active !== after.active || before.scrollX !== after.scrollX || before.scrollY !== after.scrollY || before.text !== after.text;
        if (changed) {
          return { report: true, confidence: "low", reason: "العنصر تفاعلي صغير واستجاب للنقر، لذلك يُنقل إلى الملاحظات ولا يُعد مخالفة مؤكدة إلا بعد مراجعة الاسم والسياق.", context: result.context };
        }
      } catch {
        return { report: true, confidence: "medium", reason: "تعذر اختبار العنصر التفاعلي الصغير أثناء الفحص الآلي.", context: result.context };
      }
    }
    if ((violation.id === "link-name" || violation.id === "button-name") && result.carouselLike) {
      const before = await page.evaluate(() => ({
        url: location.href,
        active: document.querySelectorAll(".active, .swiper-slide-active, .slick-active, [aria-expanded='true']").length,
        scrollX,
        scrollY,
        text: (document.body.innerText || "").slice(0, 2000)
      }));
      try {
        await page.locator(selector).first().click({ timeout: 1200, trial: false });
        await page.waitForTimeout(350);
        const after = await page.evaluate(() => ({
          url: location.href,
          active: document.querySelectorAll(".active, .swiper-slide-active, .slick-active, [aria-expanded='true']").length,
          scrollX,
          scrollY,
          text: (document.body.innerText || "").slice(0, 2000)
        }));
        const changed = before.url !== after.url || before.active !== after.active || before.scrollX !== after.scrollX || before.scrollY !== after.scrollY || before.text !== after.text;
        if (changed) return { report: false, confidence: "medium", reason: "تم اختبار عنصر التحكم وتغيرت حالة الصفحة بعد النقر." };
      } catch {
        return { report: true, confidence: "medium", reason: "تعذر النقر على عنصر التحكم أثناء التحقق الآلي." };
      }
    }
    if ((violation.id === "link-name" || violation.id === "button-name") && result.carouselLike && result.smallWidget) {
      return { report: false, confidence: "low", reason: "تم تجاهل عنصر تحكم Carousel مكرر/مكتبي صغير لتجنب false positive." };
    }
    if ((violation.id === "region" || violation.id.includes("landmark")) && (result.smallWidget || result.inChrome || result.carouselLike)) {
      return { report: false, confidence: "low", reason: "العقدة تبدو كأداة عائمة أو عنصر قالب وليست محتوى رئيسيًا." };
    }
    if (violation.id.includes("heading-order") && !result.meaningfulHeading) {
      return { report: false, confidence: "low", reason: "العنوان مخفي أو داخل قالب/تذييل أو لا يمثل محتوى رئيسيًا." };
    }

    return { report: true, confidence: result.carouselLike || result.smallWidget ? "medium" : "high", reason: "" };
  } catch {
    return { report: false, confidence: "low", reason: "تعذر التحقق من العقدة في DOM قبل إنشاء المخالفة." };
  }
}

async function buildPageIssues(page, scanId, pageIndex, dom, responsive, axeSummary) {
  const pageId = `real-page-${pageIndex + 1}`;
  const pageName = pageIndex === 0 ? "الصفحة الرئيسية المفحوصة" : `صفحة مفحوصة ${pageIndex + 1}`;
  const pageUrl = dom.finalUrl;
  const issues = [];

  const addExampleIssues = async (examples, config) => {
    for (const [index, example] of examples.entries()) {
      issues.push(await issueWithScreenshot(page, {
        scanId,
        pageId,
        pageName,
        pageUrl,
        ruleCode: config.ruleCode,
        ruleName: config.ruleName,
        componentType: config.componentType,
        title: config.title,
        description: config.description(example, index),
        severity: config.severity,
        reason: config.reason,
        recommendation: config.recommendation,
        selector: example.selector,
        simpleSelector: example.simpleSelector,
        htmlSnippet: example.html,
        evidence: config.evidence(example),
        evidenceDetails: {
          text: example.text,
          alt: example.alt,
          href: example.href,
          ariaLabel: example.ariaLabel,
          src: example.src,
          id: example.id,
          name: example.name,
          placeholder: example.placeholder
        },
        source: "DOM"
      }));
    }
  };

  if (!dom.hasLangAr) {
    issues.push(await issueWithScreenshot(page, {
      scanId, pageId, pageName, pageUrl,
      ruleCode: "A11Y-010", ruleName: "تعريف لغة الصفحة", componentType: "HTML",
      title: "لغة الصفحة غير معرفة بالعربية", description: "لم يتم العثور على lang عربي واضح على عنصر html.", severity: "عالية",
      reason: "قارئات الشاشة ومحركات البحث تحتاج تعريف اللغة لتفسير المحتوى العربي بشكل صحيح.",
      recommendation: "أضف lang=\"ar\" على وسم html.", selector: "html", htmlSnippet: "<html>", evidence: `lang الحالي: ${dom.lang || "غير موجود"}`, source: "DOM"
    }));
  }

  if (!dom.hasRtl) {
    issues.push(await issueWithScreenshot(page, {
      scanId, pageId, pageName, pageUrl,
      ruleCode: "RTL-001", ruleName: "دعم اتجاه RTL", componentType: "HTML",
      title: "اتجاه الصفحة العربية ليس RTL", description: "لم يتم العثور على dir=\"rtl\" على الصفحة.", severity: "عالية",
      reason: "الصفحات العربية تحتاج اتجاه RTL لضمان ترتيب القراءة والمكونات بشكل صحيح.",
      recommendation: "أضف dir=\"rtl\" على html أو الحاوية الأساسية.", selector: "html", htmlSnippet: "<html>", evidence: `dir الحالي: ${dom.dir || "غير موجود"}`, source: "DOM"
    }));
  }

  if (!dom.headingOrderLooksValid && dom.headingOrderExample) {
    issues.push(await issueWithScreenshot(page, {
      scanId, pageId, pageName, pageUrl,
      ruleCode: "A11Y-003", ruleName: "تسلسل العناوين", componentType: "العناوين",
      title: "ترتيب العناوين غير صحيح", description: "تم رصد قفزة في تسلسل العناوين الدلالي.", severity: "متوسطة",
      reason: "ترتيب العناوين يساعد مستخدمي قارئات الشاشة على فهم بنية الصفحة.",
      recommendation: "استخدم تسلسلًا منطقيًا h1 ثم h2 ثم h3 دون قفزات غير مبررة.",
      selector: dom.headingOrderExample.selector, simpleSelector: dom.headingOrderExample.simpleSelector, htmlSnippet: dom.headingOrderExample.html, evidence: "قفزة في مستوى heading.", evidenceDetails: { context: dom.headingOrderExample.context }, source: "DOM"
    }));
  }

  await addExampleIssues(dom.imagesWithoutAltExamples, {
    ruleCode: "A11Y-001", ruleName: "النص البديل للصور", componentType: "الصور", title: "صورة بدون نص بديل",
    severity: "عالية", reason: "قارئات الشاشة لا تستطيع تفسير الصورة بدون alt.", recommendation: "أضف alt وصفيًا للصور المحتوائية أو alt فارغًا للصور الزخرفية.",
    description: () => "تم العثور على صورة بدون خاصية alt.", evidence: (ex) => `src: ${ex.src || "غير ظاهر"}`
  });

  await addExampleIssues(dom.buttonsWithoutTextExamples, {
    ruleCode: "BTN-001", ruleName: "وضوح نص الزر", componentType: "الأزرار", title: "زر بدون اسم قابل للوصول",
    severity: "متوسطة", reason: "الأزرار الأيقونية بدون aria-label تظهر لقارئ الشاشة كزر غير مسمى.", recommendation: "أضف نصًا واضحًا أو aria-label يصف وظيفة الزر.",
    description: () => "تم العثور على زر بدون نص أو اسم قابل للوصول.", evidence: (ex) => `text='${ex.text || ""}' aria-label='${ex.ariaLabel || ""}'`
  });

  await addExampleIssues(dom.inputsWithoutLabelExamples, {
    ruleCode: "FORM-001", ruleName: "تسمية الحقول", componentType: "النماذج", title: "حقل إدخال بدون label",
    severity: "حرجة", reason: "الحقول غير المسماة لا تكون مفهومة لقارئات الشاشة.", recommendation: "اربط كل حقل label باستخدام for/id أو استخدم aria-label واضح.",
    description: () => "تم العثور على حقل إدخال بدون label أو اسم قابل للوصول.", evidence: (ex) => `placeholder='${ex.placeholder || ""}' name='${ex.name || ""}' id='${ex.id || ""}'`
  });

  await addExampleIssues(dom.linksWithWeakTextExamples, {
    ruleCode: "LINK-001", ruleName: "نص الرابط الوصفي", componentType: "الروابط", title: "رابط بنص غير وصفي",
    severity: "متوسطة", reason: "نصوص مثل اضغط هنا لا تشرح الوجهة عند قراءة قائمة الروابط.", recommendation: "استبدل النص بنص يصف الوجهة أو الإجراء.",
    description: () => "تم العثور على رابط بنص ضعيف أو عام.", evidence: (ex) => `text='${ex.text}' href='${ex.href}'`
  });

  await addExampleIssues(dom.tablesWithoutHeadersExamples, {
    ruleCode: "TABLE-001", ruleName: "رؤوس الجداول", componentType: "الجداول", title: "جدول بدون رؤوس دلالية",
    severity: "متوسطة", reason: "رؤوس الجداول تربط الخلايا بمعانيها لقارئات الشاشة.", recommendation: "استخدم th وscope أو أدوار columnheader/rowheader.",
    description: () => "تم العثور على جدول بدون th أو headers دلالية.", evidence: () => "table بدون th"
  });

  await addExampleIssues(dom.emptyHeadingsExamples, {
    ruleCode: "A11Y-003", ruleName: "تسلسل العناوين", componentType: "العناوين", title: "عنوان فارغ",
    severity: "منخفضة", reason: "العناوين الفارغة تشتت مستخدمي قارئات الشاشة.", recommendation: "أضف نصًا واضحًا للعنوان أو أزل العنصر إذا كان زخرفيًا.",
    description: () => "تم العثور على heading بدون نص.", evidence: () => "heading بدون نص ظاهر"
  });

  if (responsive.hasHorizontalOverflow && responsive.overflowElements.length > 0) {
    const ex = responsive.overflowElements[0];
    issues.push(await issueWithScreenshot(page, {
      scanId, pageId, pageName, pageUrl,
      ruleCode: "RESP-001", ruleName: "عدم وجود تمرير أفقي", componentType: "التجاوب",
      title: "عنصر يتجاوز عرض شاشة الجوال", description: "تم رصد تمرير أفقي أو عنصر يتجاوز عرض شاشة 390px.", severity: "عالية",
      reason: "التجاوز الأفقي يضعف تجربة الجوال ويخالف متطلبات التجاوب.", recommendation: "استخدم max-width: 100% وCSS responsive بدل العروض الثابتة.",
      selector: ex.selector, htmlSnippet: ex.html, evidence: `عرض العنصر ${ex.width}px والحد الأيمن ${ex.right}px داخل شاشة ${responsive.viewportWidth}px`, source: "Responsive"
    }));
  }

  for (const violation of axeSummary.violations) {
    const firstNode = violation.nodes?.[0];
    const selector = Array.isArray(firstNode?.target) ? firstNode.target[0] : firstNode?.target;
    const validation = await validateAxeNode(page, violation, selector);
    if (!validation.report) continue;
    const mapping = mapAxeRule(violation.id);
    const pluginLikeEvidence = /owl|carousel|slider|slick|swiper|splide|cloned|clone|prev|next|owl-stage|owl-item/i.test(`${selector || ""} ${firstNode?.html || ""}`);
    const confidence = validation.context?.isCarousel || validation.context?.isClone || validation.context?.isControl || pluginLikeEvidence
      ? "low"
      : validation.confidence;
    const titleByAxeId = {
      "link-name": "نص الرابط الوصفي غير واضح",
      "button-name": "زر بدون اسم قابل للوصول",
      "heading-order": "تسلسل العناوين يحتاج تصحيحًا",
      region: "محتوى رئيسي خارج المعالم الدلالية"
    };
    issues.push(await issueWithScreenshot(page, {
      scanId, pageId, pageName, pageUrl,
      ruleCode: mapping.ruleCode,
      ruleName: violation.help,
      componentType: mapping.componentType,
      title: titleByAxeId[violation.id] || `مخالفة وصولية: ${violation.help}`,
      description: violation.description,
      severity: severityFromImpact(violation.impact, mapping.severity),
      reason: firstNode?.failureSummary || `axe-core رصد ${violation.nodesCount} عنصرًا متأثرًا.`,
      recommendation: violation.helpUrl ? `راجع إرشادات الإصلاح: ${violation.helpUrl}` : "راجع العنصر المتأثر وصحح دلالاته أو تسميته.",
      selector,
      simpleSelector: simpleSelectorFromEvidence({ selector, html: firstNode?.html }),
      htmlSnippet: firstNode?.html,
      evidence: firstNode?.failureSummary,
      evidenceDetails: { text: firstNode?.text || "", context: validation.context },
      source: "axe-core",
      axeId: violation.id,
      confidence
    }));
  }

  return issues;
}

async function analyzePage(page, targetUrl, scanId, pageIndex) {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: REAL_SCAN_TIMEOUT_MS });
  await page.waitForTimeout(700);
  const domSummary = await collectDomSummary(page);
  const responsiveSummary = await collectResponsiveSummary(page);
  const accessibilitySummary = await runAxeOnCurrentPage(page);
  const issues = await buildPageIssues(page, scanId, pageIndex, domSummary, responsiveSummary, accessibilitySummary);
  const score = calculatePageScore(issues);

  return {
    id: `real-page-${pageIndex + 1}`,
    name: pageIndex === 0 ? "الصفحة الرئيسية المفحوصة" : `صفحة مفحوصة ${pageIndex + 1}`,
    path: new URL(domSummary.finalUrl).pathname || "/",
    url: domSummary.finalUrl,
    title: domSummary.title,
    score,
    issuesCount: issues.length,
    status: getStatus(score),
    domSummary,
    responsiveSummary,
    accessibilitySummary,
    issues
  };
}

function getMaxPages(scanType = "full") {
  return MAX_PAGES_BY_SCAN_TYPE[scanType] || MAX_PAGES_BY_SCAN_TYPE.full;
}

async function discoverImportantUrls(page, startUrl, maxPages = MAX_PAGES_BY_SCAN_TYPE.full) {
  const start = new URL(startUrl);
  const candidates = await page.evaluate(() => {
    return [...document.querySelectorAll("a[href]")].map((a) => ({ href: a.href, text: a.innerText || a.getAttribute("aria-label") || "" }));
  });
  const keywords = /service|services|خدمات|contact|تواصل|privacy|خصوصية|terms|شروط|sitemap|خريطة|about|عن/i;
  const urls = [];
  for (const candidate of candidates) {
    try {
      const link = new URL(candidate.href);
      if (link.origin !== start.origin) continue;
      if (!keywords.test(candidate.href + " " + candidate.text)) continue;
      link.hash = "";
      const normalized = link.toString();
      if (normalized !== start.toString() && !urls.includes(normalized)) urls.push(normalized);
    } catch {
      // ignore invalid links
    }
    if (urls.length >= maxPages - 1) break;
  }
  return [start.toString(), ...urls].slice(0, maxPages);
}

export async function performPlatformCodeScan({ url, scanId, scanType = "full" }) {
  return withTimeout(withBrowser(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: REAL_SCAN_TIMEOUT_MS });
    await page.waitForTimeout(700);
    const finalStartUrl = page.url();
    const maxPages = getMaxPages(scanType);
    const urls = await withTimeout(discoverImportantUrls(page, finalStartUrl, maxPages), 8000);
    const scannedPages = [];

    for (const [index, pageUrl] of urls.entries()) {
      try {
        scannedPages.push(await analyzePage(page, pageUrl, scanId, index));
      } catch (error) {
        scannedPages.push({
          id: `real-page-${index + 1}`,
          name: `صفحة تعذر فحصها ${index + 1}`,
          path: new URL(pageUrl).pathname || "/",
          url: pageUrl,
          title: "تعذر الفحص",
          score: 0,
          issuesCount: 1,
          status: "غير مطابق",
          domSummary: {},
          responsiveSummary: {},
          accessibilitySummary: { violationsCount: 0, passesCount: 0, incompleteCount: 0, violations: [] },
          issues: [{
            id: `real-page-error-${index + 1}`,
            scanId,
            pageId: `real-page-${index + 1}`,
            pageName: `صفحة تعذر فحصها ${index + 1}`,
            pageUrl,
            componentType: "الفحص",
            ruleId: "SCAN-001",
            ruleCode: "SCAN-001",
            ruleName: "إمكانية الوصول للصفحة",
            title: "تعذر فتح الصفحة للفحص",
            description: error.message,
            severity: "عالية",
            status: "مفتوح",
            reason: "لم يتمكن النظام من الوصول للصفحة خلال المهلة المحددة.",
            recommendation: "تحقق من توفر الصفحة أو أعد المحاولة لاحقًا.",
            found: error.message,
            why: "عدم القدرة على فحص الصفحة يمنع الحكم على مطابقتها.",
            fix: "تحقق من الرابط، الحماية، أو سرعة الاستجابة.",
            before: pageUrl,
            after: "صفحة قابلة للوصول للنظام",
            code: ""
          }]
        });
      }
    }

    const firstPage = scannedPages[0] || {};
    const allIssues = scannedPages.flatMap((item) => item.issues || []);
    const totals = scannedPages.reduce((acc, item) => {
      const dom = item.domSummary || {};
      acc.linksCount += dom.linksCount || 0;
      acc.imagesCount += dom.imagesCount || 0;
      acc.buttonsCount += dom.buttonsCount || 0;
      acc.inputsCount += dom.inputsCount || 0;
      acc.headingsCount += dom.headingsCount || 0;
      acc.tablesCount += dom.tablesCount || 0;
      acc.axeViolationsCount += item.accessibilitySummary?.violationsCount || 0;
      acc.axePassesCount += item.accessibilitySummary?.passesCount || 0;
      acc.axeIncompleteCount += item.accessibilitySummary?.incompleteCount || 0;
      return acc;
    }, { linksCount: 0, imagesCount: 0, buttonsCount: 0, inputsCount: 0, headingsCount: 0, tablesCount: 0, axeViolationsCount: 0, axePassesCount: 0, axeIncompleteCount: 0 });

    return {
      enabled: true,
      url,
      title: firstPage.title || "غير متوفر",
      finalUrl: firstPage.url || finalStartUrl,
      scannedPages,
      domSummary: {
        ...(firstPage.domSummary || {}),
        ...totals
      },
      accessibilitySummary: {
        violationsCount: totals.axeViolationsCount,
        passesCount: totals.axePassesCount,
        incompleteCount: totals.axeIncompleteCount,
        violations: scannedPages.flatMap((item) => item.accessibilitySummary?.violations || []).slice(0, 20)
      },
      detectedIssues: allIssues
    };
  }), REAL_SCAN_TIMEOUT_MS * 2);
}

// Backward-compatible helpers used by older code paths.
export async function scanTarget({ url, scanType }) {
  return { url, scanType, mode: "real-capable", scannedAt: new Date().toISOString() };
}

export async function crawlWebsite(url) {
  return withTimeout(withBrowser(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: REAL_SCAN_TIMEOUT_MS });
    const html = await page.content();
    const domSummary = await collectDomSummary(page);
    return { ...domSummary, html };
  }));
}

export async function analyzeDom(pageHtml) {
  const htmlTag = pageHtml.match(/<html\b[^>]*>/i)?.[0] ?? "";
  const lang = getAttribute(htmlTag, "lang").toLowerCase();
  const dir = getAttribute(htmlTag, "dir").toLowerCase();
  const imageTags = pageHtml.match(/<img\b[^>]*>/gi) ?? [];
  const buttonTags = pageHtml.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? [];
  const linkTags = pageHtml.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  const inputTags = pageHtml.match(/<(input|textarea|select)\b[^>]*>/gi) ?? [];
  const labelForIds = new Set([...pageHtml.matchAll(/<label\b[^>]*for\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]));
  const headings = [...pageHtml.matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]));
  let previousLevel = 0;
  const headingOrderLooksValid = headings.every((level) => {
    const isValid = previousLevel === 0 || level <= previousLevel + 1;
    previousLevel = level;
    return isValid;
  });
  return {
    hasLangAr: lang === "ar" || lang.startsWith("ar-"),
    hasRtl: dir === "rtl",
    imagesWithoutAltCount: imageTags.filter((tag) => !/\salt\s*=/i.test(tag)).length,
    buttonsWithoutTextCount: buttonTags.filter((tag) => !stripTags(tag) && !getAttribute(tag, "aria-label")).length,
    linksWithWeakTextCount: linkTags.filter((tag) => WEAK_LINK_TEXTS.some((weak) => stripTags(tag).toLowerCase() === weak.toLowerCase())).length,
    inputsWithoutLabelCount: inputTags.filter((tag) => {
      const id = getAttribute(tag, "id");
      return !getAttribute(tag, "aria-label") && !getAttribute(tag, "aria-labelledby") && (!id || !labelForIds.has(id));
    }).length,
    hasH1: countMatches(pageHtml, /<h1\b/gi) > 0,
    headingOrderLooksValid
  };
}

export async function runAccessibilityScan(url) {
  return withTimeout(withBrowser(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: REAL_SCAN_TIMEOUT_MS });
    return runAxeOnCurrentPage(page);
  }));
}

export async function captureElementScreenshot(selector) {
  return { enabled: false, selector, warning: "استخدم performPlatformCodeScan للحصول على صور العناصر المخالفة" };
}

export async function runPerformanceAudit(url) {
  return { enabled: false, url, warning: "تدقيق Lighthouse غير مفعل في هذه النسخة" };
}
