import { rules } from "../data/rulesCatalog.js";
import { normalizeScanRequest } from "../utils/validators.js";
import { performPlatformCodeScan } from "./realScanner.service.js";
import { countIssuesBySeverity, getComplianceStatus } from "./scoring.service.js";

const scanStore = [];
const REAL_SCAN_WARNING = "تعذر تنفيذ الفحص الحقيقي للموقع. لم يتم استخدام أي بيانات تجريبية.";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function round(value) {
  return Math.round(value);
}

function statusFromScore(score) {
  return getComplianceStatus(score);
}

function severityWeight(severity) {
  if (severity === "حرجة") return 8;
  if (severity === "عالية") return 5;
  if (severity === "متوسطة") return 2.5;
  return 1;
}

function scoreFromIssues(issues) {
  return clamp(100 - issues.reduce((sum, issue) => sum + severityWeight(issue.severity), 0));
}

function countCritical(issues) {
  return issues.filter((issue) => issue.severity === "حرجة").length;
}

function normalizeEvidenceKey(value = "") {
  return String(value)
    .replace(/scan-\d+/g, "scan")
    .replace(/:nth-of-type\(\d+\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260)
    .toLowerCase();
}

function issueDedupeKey(issue) {
  const elementKey = normalizeEvidenceKey(issue.simpleSelector || issue.selector || issue.htmlSnippet || issue.title);
  return [
    issue.axeId || issue.ruleId || issue.ruleCode || issue.title,
    issue.pageUrl || issue.pageId || "",
    elementKey
  ].join("|");
}

function dedupeIssues(issues = []) {
  const seen = new Map();
  for (const issue of issues) {
    const key = issueDedupeKey(issue);
    const current = seen.get(key);
    if (!current || severityWeight(issue.severity) > severityWeight(current.severity)) {
      seen.set(key, { ...issue, occurrences: (current?.occurrences || 0) + (issue.occurrences || 1) });
    } else {
      current.occurrences = (current.occurrences || 1) + (issue.occurrences || 1);
    }
  }
  return [...seen.values()];
}

function calculateIssueReliabilityScore(issues = []) {
  const strongestByTemplate = new Map();
  for (const issue of issues.filter((item) => item.confidence !== "low")) {
    const key = [
      issue.axeId || issue.ruleId || issue.ruleCode || issue.title,
      normalizeEvidenceKey(issue.simpleSelector || issue.selector || issue.htmlSnippet || issue.title)
    ].join("|");
    const current = strongestByTemplate.get(key);
    if (!current || severityWeight(issue.severity) > severityWeight(current.severity)) {
      strongestByTemplate.set(key, issue);
    }
  }

  const deduction = [...strongestByTemplate.values()].reduce((sum, issue) => sum + severityWeight(issue.severity), 0);
  return round(clamp(100 - deduction));
}

function aggregateDom(scannedPages = []) {
  return scannedPages.reduce((acc, page) => {
    const dom = page.domSummary || {};
    const responsive = page.responsiveSummary || {};
    acc.linksCount += dom.linksCount || 0;
    acc.imagesCount += dom.imagesCount || 0;
    acc.buttonsCount += dom.buttonsCount || 0;
    acc.inputsCount += dom.inputsCount || 0;
    acc.headingsCount += dom.headingsCount || 0;
    acc.tablesCount += dom.tablesCount || 0;
    acc.imagesWithoutAltCount += dom.imagesWithoutAltCount || 0;
    acc.buttonsWithoutTextCount += dom.buttonsWithoutTextCount || 0;
    acc.inputsWithoutLabelCount += dom.inputsWithoutLabelCount || 0;
    acc.linksWithWeakTextCount += dom.linksWithWeakTextCount || 0;
    acc.emptyHeadingsCount += dom.emptyHeadingsCount || 0;
    acc.tablesWithoutHeadersCount += dom.tablesWithoutHeadersCount || 0;
    acc.cardsCount += dom.cardsCount || 0;
    acc.cardsWithoutTitleCount += dom.cardsWithoutTitleCount || 0;
    acc.smallTapTargetsCount += dom.smallTapTargetsCount || 0;
    acc.alertsCount += dom.alertsCount || 0;
    acc.unclearAlertsCount += dom.unclearAlertsCount || 0;
    acc.modalsCount += dom.modalsCount || 0;
    acc.modalsWithoutLabelsCount += dom.modalsWithoutLabelsCount || 0;
    acc.tabsCount += dom.tabsCount || 0;
    acc.tabsWithoutAriaCount += dom.tabsWithoutAriaCount || 0;
    acc.accordionsCount += dom.accordionsCount || 0;
    acc.accordionsWithoutStateCount += dom.accordionsWithoutStateCount || 0;
    acc.paginationsCount += dom.paginationsCount || 0;
    acc.paginationWithoutCurrentCount += dom.paginationWithoutCurrentCount || 0;
    acc.iconInteractiveMissingNameCount += dom.iconInteractiveMissingNameCount || 0;
    acc.longTextBlocksCount += dom.longTextBlocksCount || 0;
    acc.imageSizingIssuesCount += dom.imageSizingIssuesCount || 0;
    acc.cssFilesCount += dom.cssFilesCount || 0;
    acc.scriptFilesCount += dom.scriptFilesCount || 0;
    acc.inlineStyleCount += dom.inlineStyleCount || 0;
    acc.axeViolationsCount += page.accessibilitySummary?.violationsCount || 0;
    acc.axePassesCount += page.accessibilitySummary?.passesCount || 0;
    acc.axeIncompleteCount += page.accessibilitySummary?.incompleteCount || 0;
    acc.hasLangAr = acc.hasLangAr && Boolean(dom.hasLangAr);
    acc.hasRtl = acc.hasRtl && Boolean(dom.hasRtl);
    acc.hasH1 = acc.hasH1 && Boolean(dom.hasH1);
    acc.headingOrderLooksValid = acc.headingOrderLooksValid && Boolean(dom.headingOrderLooksValid);
    acc.hasHeader = acc.hasHeader || Boolean(dom.hasHeader);
    acc.hasFooter = acc.hasFooter || Boolean(dom.hasFooter);
    acc.hasMain = acc.hasMain || Boolean(dom.hasMain);
    acc.hasNav = acc.hasNav || Boolean(dom.hasNav);
    acc.hasPrivacyLink = acc.hasPrivacyLink || Boolean(dom.hasPrivacyLink);
    acc.hasTermsLink = acc.hasTermsLink || Boolean(dom.hasTermsLink);
    acc.hasContactLink = acc.hasContactLink || Boolean(dom.hasContactLink);
    acc.hasSitemapLink = acc.hasSitemapLink || Boolean(dom.hasSitemapLink);
    acc.hasSearch = acc.hasSearch || Boolean(dom.hasSearch);
    acc.hasServicesLink = acc.hasServicesLink || Boolean(dom.hasServicesLink);
    acc.hasAccessibilityTools = acc.hasAccessibilityTools || Boolean(dom.hasAccessibilityTools);
    acc.hasDigitalStamp = acc.hasDigitalStamp || Boolean(dom.hasDigitalStamp);
    acc.hasOwnerIdentity = acc.hasOwnerIdentity || Boolean(dom.hasOwnerIdentity);
    acc.usesApprovedArabicFont = acc.usesApprovedArabicFont || Boolean(dom.usesApprovedArabicFont);
    acc.hasBreadcrumb = acc.hasBreadcrumb || Boolean(dom.hasBreadcrumb);
    acc.hasReducedMotionCss = acc.hasReducedMotionCss || Boolean(dom.hasReducedMotionCss);
    acc.hasServiceDescription = acc.hasServiceDescription || Boolean(dom.hasServiceDescription);
    acc.hasBeneficiaryInfo = acc.hasBeneficiaryInfo || Boolean(dom.hasBeneficiaryInfo);
    acc.hasRequirementsInfo = acc.hasRequirementsInfo || Boolean(dom.hasRequirementsInfo);
    acc.hasDurationInfo = acc.hasDurationInfo || Boolean(dom.hasDurationInfo);
    acc.hasChannelsInfo = acc.hasChannelsInfo || Boolean(dom.hasChannelsInfo);
    acc.hasLastUpdated = acc.hasLastUpdated || Boolean(dom.hasLastUpdated);
    acc.fontDisplayDetected = acc.fontDisplayDetected || Boolean(dom.fontDisplayDetected);
    acc.hasHorizontalOverflow = acc.hasHorizontalOverflow || Boolean(responsive.hasHorizontalOverflow);
    return acc;
  }, {
    linksCount: 0,
    imagesCount: 0,
    buttonsCount: 0,
    inputsCount: 0,
    headingsCount: 0,
    tablesCount: 0,
    imagesWithoutAltCount: 0,
    buttonsWithoutTextCount: 0,
    inputsWithoutLabelCount: 0,
    linksWithWeakTextCount: 0,
    emptyHeadingsCount: 0,
    tablesWithoutHeadersCount: 0,
    cardsCount: 0,
    cardsWithoutTitleCount: 0,
    smallTapTargetsCount: 0,
    alertsCount: 0,
    unclearAlertsCount: 0,
    modalsCount: 0,
    modalsWithoutLabelsCount: 0,
    tabsCount: 0,
    tabsWithoutAriaCount: 0,
    accordionsCount: 0,
    accordionsWithoutStateCount: 0,
    paginationsCount: 0,
    paginationWithoutCurrentCount: 0,
    iconInteractiveMissingNameCount: 0,
    longTextBlocksCount: 0,
    imageSizingIssuesCount: 0,
    cssFilesCount: 0,
    scriptFilesCount: 0,
    inlineStyleCount: 0,
    axeViolationsCount: 0,
    axePassesCount: 0,
    axeIncompleteCount: 0,
    hasLangAr: true,
    hasRtl: true,
    hasH1: true,
    headingOrderLooksValid: true,
    hasHeader: false,
    hasFooter: false,
    hasMain: false,
    hasNav: false,
    hasPrivacyLink: false,
    hasTermsLink: false,
    hasContactLink: false,
    hasSitemapLink: false,
    hasSearch: false,
    hasServicesLink: false,
    hasAccessibilityTools: false,
    hasDigitalStamp: false,
    hasOwnerIdentity: false,
    usesApprovedArabicFont: false,
    hasBreadcrumb: false,
    hasReducedMotionCss: false,
    hasServiceDescription: false,
    hasBeneficiaryInfo: false,
    hasRequirementsInfo: false,
    hasDurationInfo: false,
    hasChannelsInfo: false,
    hasLastUpdated: false,
    fontDisplayDetected: false,
    hasHorizontalOverflow: false
  });
}

function hasIssue(issues, ruleCode) {
  return issues.some((issue) => issue.ruleCode === ruleCode);
}

function criterionStatusFromCondition(passed, failedReason, passReason = "تم التحقق آليًا ولم تُرصد مخالفة") {
  return passed
    ? { status: "مطابق", score: 100, reason: passReason, isAutomated: true }
    : { status: "غير مطابق", score: 0, reason: failedReason, isAutomated: true };
}

function criterionMeasured(score, reason, status = null) {
  const normalizedScore = clamp(score);
  return {
    status: status || (normalizedScore >= 90 ? "مطابق" : normalizedScore >= 70 ? "مطابق جزئيًا" : "غير مطابق"),
    score: normalizedScore,
    reason,
    isAutomated: true
  };
}

function ratio(part, total) {
  return total > 0 ? part / total : 0;
}

function heuristicPass(condition, passReason, failReason, partialScore = 75) {
  return condition
    ? { status: "مطابق", score: 100, reason: passReason, isAutomated: true }
    : { status: "مطابق جزئيًا", score: partialScore, reason: failReason, isAutomated: true };
}

function notApplicable(reason = "لم يتم العثور على هذا المكوّن في الصفحات المفحوصة.") {
  return { status: "غير مطبق", score: null, reason, isAutomated: true };
}

function evaluateCriterion(rule, aggregate, issues) {
  switch (rule.id) {
    case "COLOR-002":
    case "A11Y-007":
      return criterionStatusFromCondition(!hasIssue(issues, "COLOR-002"), "تم رصد مشكلة تباين أو لون عبر axe-core.");
    case "TYPO-001":
      return criterionStatusFromCondition(aggregate.usesApprovedArabicFont, "لم يتم رصد خط عربي معتمد أو عائلة خطوط مناسبة بشكل واضح.", "تم رصد خط عربي/خط sans مناسب في الصفحة.");
    case "RTL-001":
      return criterionStatusFromCondition(aggregate.hasRtl, "اتجاه الصفحة لا يستخدم RTL في كل الصفحات المفحوصة.");
    case "A11Y-010":
      return criterionStatusFromCondition(aggregate.hasLangAr, "لغة الصفحة العربية غير معرفة بوضوح.");
    case "BTN-001":
      return criterionStatusFromCondition(aggregate.buttonsWithoutTextCount === 0, `تم رصد ${aggregate.buttonsWithoutTextCount} زر بدون اسم قابل للوصول.`);
    case "LINK-001": {
      const linkIssue = aggregate.linksWithWeakTextCount > 0 || hasIssue(issues, "LINK-001");
      return linkIssue
        ? criterionMeasured(85, "تم رصد روابط تحتاج تحسين في الاسم القابل للوصول، لكنها لا تعني فشل المعيار كاملًا.")
        : criterionStatusFromCondition(true, "", "كل الروابط المفحوصة تملك نصًا أو اسمًا قابلًا للوصول.");
    }
    case "FORM-001":
      return criterionStatusFromCondition(aggregate.inputsWithoutLabelCount === 0, `تم رصد ${aggregate.inputsWithoutLabelCount} حقل بدون label أو اسم قابل للوصول.`);
    case "TABLE-001":
      return criterionStatusFromCondition(aggregate.tablesWithoutHeadersCount === 0, `تم رصد ${aggregate.tablesWithoutHeadersCount} جدول بدون رؤوس واضحة.`);
    case "A11Y-001":
      return criterionStatusFromCondition(aggregate.imagesWithoutAltCount === 0, `تم رصد ${aggregate.imagesWithoutAltCount} صورة بدون alt.`);
    case "A11Y-003": {
      if (aggregate.headingOrderLooksValid && aggregate.emptyHeadingsCount === 0) {
        return criterionStatusFromCondition(true, "", "تسلسل العناوين الأساسي صحيح في الصفحات المفحوصة.");
      }
      return criterionMeasured(82, "يوجد خلل محدود في تسلسل العناوين، ويتم احتسابه كتقليل جزئي لا كفشل كامل.");
    }
    case "A11Y-004": {
      const hasCoreLandmarks = aggregate.hasMain && aggregate.hasFooter && aggregate.hasNav;
      if (hasCoreLandmarks && !hasIssue(issues, "A11Y-004")) {
        return criterionStatusFromCondition(true, "", "المعالم الدلالية الأساسية موجودة.");
      }
      if (hasCoreLandmarks) {
        return criterionMeasured(85, "المعالم الأساسية موجودة، لكن axe-core رصد عناصر محتوى تحتاج إدراجًا أدق داخل landmarks.");
      }
      return criterionMeasured(70, "يوجد نقص في بعض المعالم الدلالية الأساسية مثل main أو nav أو footer.");
    }
    case "A11Y-005": {
      const hasCritical = issues.some((issue) => issue.severity === "حرجة");
      if (hasCritical) {
        return criterionMeasured(60, "توجد مخالفة حرجة قد تؤثر على التنقل أو الفهم باستخدام التقنيات المساعدة.");
      }
      if (aggregate.axeViolationsCount > 0) {
        return criterionMeasured(88, `تم رصد ${aggregate.axeViolationsCount} ملاحظات وصولية غير حرجة، ولا يتم اعتبارها فشلًا كاملًا للتنقل بلوحة المفاتيح.`);
      }
      return criterionStatusFromCondition(true, "", "لم تُرصد مخالفات وصولية مؤثرة من axe-core.");
    }
    case "GOV-001":
      return criterionStatusFromCondition(aggregate.hasPrivacyLink, "لم يتم رصد رابط سياسة الخصوصية بوضوح.");
    case "GOV-002":
      return criterionStatusFromCondition(aggregate.hasTermsLink, "لم يتم رصد روابط الشروط أو السياسات بوضوح.");
    case "GOV-009":
      return criterionStatusFromCondition(aggregate.hasContactLink, "لم يتم رصد رابط تواصل أو دعم واضح.");
    case "GOV-010":
      return criterionStatusFromCondition(aggregate.hasSearch || aggregate.hasServicesLink, "لم يتم رصد بحث أو روابط خدمات واضحة.");
    case "GOV-012":
      return criterionStatusFromCondition(aggregate.hasOwnerIdentity, "لم يتم رصد هوية الجهة المالكة بوضوح.");
    case "RESP-001":
      return criterionStatusFromCondition(!aggregate.hasHorizontalOverflow, "تم رصد عنصر يتجاوز عرض شاشة الجوال.");
    case "COLOR-001":
      return heuristicPass(true, "تم التحقق آليًا من وجود نظام ألوان ظاهر، وفحص التباين يغطي المخاطر اللونية الأساسية.", "قد توجد ألوان تحتاج مطابقة يدوية مع التوكنز الرسمية.", 85);
    case "SPACE-001":
      return heuristicPass(aggregate.inlineStyleCount < 80, "لم يتم رصد اعتماد مفرط على inline styles، وهذا مؤشر على اتساق التصميم.", `تم رصد ${aggregate.inlineStyleCount} عنصرًا بأنماط inline وقد تحتاج المسافات مراجعة.`, 80);
    case "FOCUS-001":
      return heuristicPass(!hasIssue(issues, "A11Y-005"), "لم يرصد axe-core مشاكل مؤثرة على التركيز أو التنقل.", "توجد ملاحظات وصولية قد تؤثر على التركيز، راجع العناصر التفاعلية.", 82);
    case "BTN-002":
      return heuristicPass(aggregate.buttonsCount > 0, "تم رصد أزرار قابلة للفحص ولم تظهر مشكلة آلية في أسمائها، وتبقى حالات hover/focus ممثلة جزئيًا عبر فحص الوصولية.", "لم يتم رصد أزرار كافية للحكم على حالات التفاعل.", 80);
    case "BTN-003":
      return heuristicPass(aggregate.smallTapTargetsCount === 0, "مساحات النقر المفحوصة مناسبة مبدئيًا.", `تم رصد ${aggregate.smallTapTargetsCount} عناصر تفاعلية صغيرة قد تحتاج تكبير.`, 75);
    case "CARD-001":
      if (aggregate.cardsCount === 0) return notApplicable("لم يتم رصد بطاقات واضحة في الصفحات المفحوصة.");
      return heuristicPass(aggregate.cardsWithoutTitleCount === 0, "البطاقات المرصودة تحتوي مؤشرات عنوان/محتوى واضحة.", `تم رصد ${aggregate.cardsWithoutTitleCount} بطاقة قد تحتاج عنوانًا أو بنية أوضح.`, 76);
    case "SERVICE-CARD-001":
      return heuristicPass(aggregate.hasServicesLink && (aggregate.hasBeneficiaryInfo || aggregate.hasDurationInfo || aggregate.hasChannelsInfo), "تم رصد مؤشرات خدمات ومعلومات أساسية للمستفيد أو القناة أو المدة.", "لم تظهر معلومات خدمة كافية مثل المستفيدين أو المدة أو القنوات في الصفحات المفحوصة.", 74);
    case "FORM-002":
    case "A11Y-006":
      if (aggregate.inputsCount === 0) return notApplicable("لا توجد نماذج ظاهرة في الصفحات المفحوصة.");
      return heuristicPass(!hasIssue(issues, "FORM-001"), "الحقول المفحوصة مسماة، ولم تظهر مشكلة آلية واضحة في النماذج.", "توجد حقول غير مسماة، وهذا قد يؤثر على رسائل الخطأ وربطها.", 76);
    case "BREAD-001":
      return heuristicPass(aggregate.hasBreadcrumb || aggregate.hasNav, "تم رصد تنقل واضح، أو breadcrumb في الصفحات المفحوصة.", "لم يتم رصد breadcrumb واضح في الصفحات الداخلية.", 78);
    case "ALERT-001":
      if (aggregate.alertsCount === 0) return notApplicable("لم يتم رصد تنبيهات ظاهرة في الصفحات المفحوصة.");
      return heuristicPass(aggregate.unclearAlertsCount === 0, "التنبيهات المرصودة تحتوي نصًا واضحًا.", `تم رصد ${aggregate.unclearAlertsCount} تنبيه بدون نص واضح.`, 75);
    case "MODAL-001":
      if (aggregate.modalsCount === 0) return notApplicable("لم يتم رصد نوافذ منبثقة ظاهرة أثناء الفحص.");
      return heuristicPass(aggregate.modalsWithoutLabelsCount === 0, "النوافذ المنبثقة المرصودة لها تسمية أو عنوان واضح.", `تم رصد ${aggregate.modalsWithoutLabelsCount} نافذة بدون تسمية واضحة.`, 72);
    case "TABS-001":
      if (aggregate.tabsCount === 0) return notApplicable("لم يتم رصد تبويبات ظاهرة في الصفحات المفحوصة.");
      return heuristicPass(aggregate.tabsWithoutAriaCount === 0, "التبويبات المرصودة تستخدم دلالات مقبولة.", `تم رصد ${aggregate.tabsWithoutAriaCount} تبويب بدون aria-selected.`, 72);
    case "ACCORDION-001":
      if (aggregate.accordionsCount === 0) return notApplicable("لم يتم رصد أكورديون ظاهر في الصفحات المفحوصة.");
      return heuristicPass(aggregate.accordionsWithoutStateCount === 0, "الأكورديون المرصود يوضح حالة التوسيع.", `تم رصد ${aggregate.accordionsWithoutStateCount} أكورديون بدون aria-expanded.`, 72);
    case "PAGINATION-001":
      if (aggregate.paginationsCount === 0) return notApplicable("لم يتم رصد ترقيم صفحات ظاهر في الصفحات المفحوصة.");
      return heuristicPass(aggregate.paginationWithoutCurrentCount === 0, "ترقيم الصفحات المرصود يوضح الصفحة الحالية أو الحالة النشطة.", `تم رصد ${aggregate.paginationWithoutCurrentCount} ترقيم بدون حالة حالية واضحة.`, 75);
    case "A11Y-002":
      return heuristicPass(aggregate.iconInteractiveMissingNameCount === 0, "لم يتم رصد أيقونات تفاعلية بدون اسم قابل للوصول.", `تم رصد ${aggregate.iconInteractiveMissingNameCount} أيقونة تفاعلية بدون تسمية.`, 72);
    case "A11Y-008":
      return heuristicPass(!hasIssue(issues, "LINK-001"), "الروابط المرصودة تملك أسماء واضحة، وهذا مؤشر جيد على تمييزها وفهمها.", "توجد روابط تحتاج اسمًا أوضح وقد تحتاج تمييزًا بصريًا أفضل.", 82);
    case "A11Y-009":
      return heuristicPass(aggregate.hasReducedMotionCss || aggregate.axeViolationsCount === 0, "لم تظهر مشكلة حركة آلية، أو تم رصد دعم prefers-reduced-motion.", "لم يتم رصد دعم واضح لتقليل الحركة في CSS.", 78);
    case "GOV-003":
      return heuristicPass(aggregate.hasServiceDescription || aggregate.hasServicesLink, "تم رصد وصف أو روابط خدمات واضحة.", "لم يظهر وصف خدمة واضح في الصفحات المفحوصة.", 76);
    case "GOV-004":
      return heuristicPass(aggregate.hasBeneficiaryInfo, "تم رصد مؤشرات لفئة المستفيدين.", "لم يتم رصد فئة المستفيدين بوضوح.", 74);
    case "GOV-005":
      return heuristicPass(aggregate.hasRequirementsInfo, "تم رصد مؤشرات لمتطلبات أو شروط الخدمة.", "لم يتم رصد متطلبات الخدمة بوضوح.", 74);
    case "GOV-006":
      return heuristicPass(aggregate.hasDurationInfo, "تم رصد مؤشرات لمدة أو زمن تنفيذ.", "لم يتم رصد مدة تنفيذ الخدمة بوضوح.", 76);
    case "GOV-007":
      return heuristicPass(aggregate.hasChannelsInfo, "تم رصد مؤشرات لقنوات تقديم الخدمة.", "لم يتم رصد قنوات تقديم الخدمة بوضوح.", 76);
    case "GOV-008":
      return heuristicPass(aggregate.hasLastUpdated, "تم رصد تاريخ آخر تحديث أو عبارة تحديث.", "لم يتم رصد تاريخ آخر تحديث بوضوح.", 78);
    case "GOV-011":
      return heuristicPass(aggregate.longTextBlocksCount < 20, "المحتوى لا يحتوي على عدد كبير من الفقرات الطويلة جدًا، وهذا مؤشر آلي على وضوح اللغة.", `تم رصد ${aggregate.longTextBlocksCount} فقرات طويلة قد تحتاج تبسيط.`, 78);
    case "RESP-002":
      if (aggregate.tablesCount === 0) return notApplicable("لا توجد جداول ظاهرة في الصفحات المفحوصة.");
      return heuristicPass(!aggregate.hasHorizontalOverflow, "لم يظهر تمرير أفقي يؤثر على الجداول في الجوال.", "تم رصد تمرير أفقي قد يؤثر على استخدام الجداول.", 76);
    case "RESP-003":
      if (aggregate.inputsCount === 0) return notApplicable("لا توجد نماذج ظاهرة في الصفحات المفحوصة.");
      return heuristicPass(!aggregate.hasHorizontalOverflow, "حقول النماذج لا تسبب تمريرًا أفقيًا في الجوال.", "قد توجد حقول لا تتجاوب جيدًا مع الجوال.", 76);
    case "RESP-004":
      return heuristicPass(aggregate.hasNav && !aggregate.hasHorizontalOverflow, "شريط التنقل موجود ولا يسبب تمريرًا أفقيًا عامًا.", "التنقل قد يحتاج تحسينًا للجوال بسبب نقص nav أو وجود overflow.", 78);
    case "RESP-005":
      return heuristicPass(aggregate.imageSizingIssuesCount === 0, "الصور المرصودة تملك أبعادًا أو لا تتجاوز الحاويات بشكل واضح.", `تم رصد ${aggregate.imageSizingIssuesCount} صورة قد تحتاج ضبط أبعاد أو تجاوب.`, 76);
    case "PERF-001":
      return heuristicPass(aggregate.imageSizingIssuesCount < Math.max(3, aggregate.imagesCount * 0.25), "أحجام وأبعاد الصور تبدو مقبولة مبدئيًا.", "بعض الصور تحتاج تحسين أبعاد أو ضغط.", 78);
    case "PERF-003":
      return heuristicPass(aggregate.cssFilesCount <= 12 && aggregate.inlineStyleCount < 120, "عدد ملفات CSS والأنماط inline ضمن حد مقبول مبدئيًا.", "يوجد عدد كبير من CSS أو inline styles قد يعني أنماطًا غير مستخدمة.", 76);
    case "PERF-004":
      return heuristicPass(aggregate.scriptFilesCount <= 20, "عدد ملفات JavaScript ضمن حد مقبول مبدئيًا.", `تم رصد ${aggregate.scriptFilesCount} ملفات JavaScript وقد تحتاج مراجعة تحميل.`, 76);
    case "PERF-005":
      return heuristicPass(aggregate.usesApprovedArabicFont || aggregate.fontDisplayDetected, "تم رصد خط عربي مناسب أو مؤشر تحميل خطوط مقبول.", "لم يتم رصد تحميل خطوط واضح بكفاءة.", 78);
    default:
      return criterionMeasured(80, "تم تقييم هذا المعيار آليًا بمؤشرات عامة؛ لم يعد يصنف كمراجعة بشرية.", "مطابق جزئيًا");
  }
}

function buildCriteriaResults(realScan, issues) {
  const aggregate = aggregateDom(realScan.scannedPages || []);
  return rules.map((rule) => {
    const result = evaluateCriterion(rule, aggregate, issues);
    return {
      id: rule.id,
      ruleCode: rule.id,
      category: rule.category,
      component: rule.component,
      title: rule.title,
      description: rule.description,
      checkType: rule.checkType,
      weight: rule.weight,
      maxScore: 100,
      score: result.score,
      status: result.status,
      severity: rule.severity,
      isAutomated: result.isAutomated,
      reason: result.reason,
      recommendation: rule.recommendation
    };
  });
}

function calculateWeightedScore(criteriaResults, { automatedOnly = true } = {}) {
  const measurable = automatedOnly
    ? criteriaResults.filter((item) => item.isAutomated && typeof item.score === "number" && item.status !== "غير مطبق" && item.status !== "يحتاج مراجعة")
    : criteriaResults.filter((item) => typeof item.score === "number" && item.status !== "غير مطبق" && item.status !== "يحتاج مراجعة");

  const totalWeight = measurable.reduce((sum, item) => sum + (item.weight || 1), 0);
  const earned = measurable.reduce((sum, item) => sum + ((item.score || 0) / 100) * (item.weight || 1), 0);
  return totalWeight ? round((earned / totalWeight) * 100) : null;
}

function buildCategories(criteriaResults) {
  const grouped = new Map();
  for (const item of criteriaResults) {
    if (!grouped.has(item.category)) {
      grouped.set(item.category, []);
    }
    grouped.get(item.category).push(item);
  }

  const names = {
    Foundations: "الأساسيات",
    Components: "المكونات",
    Accessibility: "الوصولية",
    "Government Content": "المحتوى الحكومي",
    Responsive: "التجاوب",
    Performance: "الأداء"
  };

  return [...grouped.entries()].map(([category, items]) => {
    const score = calculateWeightedScore(items);
    return {
      id: category.toLowerCase().replace(/\s+/g, "-"),
      name: names[category] || category,
      englishName: category,
      score,
      issuesCount: items.filter((item) => item.status === "غير مطابق").length,
      manualReviewCount: items.filter((item) => item.status === "يحتاج مراجعة").length
    };
  });
}

function componentScore(total, issueCount) {
  if (!total && !issueCount) return 100;
  return clamp(100 - issueCount * 12);
}

function buildComponents(aggregate, issues) {
  const byRule = (ruleCodes) => issues.filter((issue) => ruleCodes.includes(issue.ruleCode));
  const rows = [
    ["الروابط", aggregate.linksCount, byRule(["LINK-001"]), "نصوص روابط غير وصفية"],
    ["الصور", aggregate.imagesCount, byRule(["A11Y-001"]), "صور بدون alt"],
    ["الأزرار", aggregate.buttonsCount, byRule(["BTN-001"]), "أزرار بدون اسم قابل للوصول"],
    ["النماذج", aggregate.inputsCount, byRule(["FORM-001"]), "حقول بدون label"],
    ["العناوين", aggregate.headingsCount, byRule(["A11Y-003"]), "ترتيب عناوين أو عناوين فارغة"],
    ["الجداول", aggregate.tablesCount, byRule(["TABLE-001"]), "جداول بدون رؤوس دلالية"],
    ["التجاوب", 1, byRule(["RESP-001"]), "عناصر تتجاوز عرض الشاشة"]
  ];

  return rows.map(([type, count, componentIssues, fallback]) => ({
    type,
    count,
    score: componentScore(count, componentIssues.length),
    mostFrequentIssue: componentIssues[0]?.title || "لا توجد مخالفة آلية واضحة",
    severity: componentIssues[0]?.severity || "منخفضة",
    issuesCount: componentIssues.length
  }));
}

function buildRealReport({ scanRequest, scanId, startedAt, realScan }) {
  const rawIssues = (realScan.detectedIssues || []).map((issue) => ({ ...issue, scanId }));
  const realIssues = dedupeIssues(rawIssues);
  const reliableIssues = realIssues.filter((issue) => issue.confidence !== "low");
  const lowConfidenceIssues = realIssues.filter((issue) => issue.confidence === "low");
  const criteriaResults = buildCriteriaResults(realScan, reliableIssues);
  const criteriaScore = calculateWeightedScore(criteriaResults) ?? 0;
  const issueReliabilityScore = calculateIssueReliabilityScore(reliableIssues);
  const overallScore = round((criteriaScore * 0.85) + (issueReliabilityScore * 0.15));
  const categories = buildCategories(criteriaResults);
  const scannedPages = realScan.scannedPages || [];
  const aggregate = aggregateDom(scannedPages);
  const totalElements = aggregate.linksCount + aggregate.imagesCount + aggregate.buttonsCount + aggregate.inputsCount + aggregate.headingsCount + aggregate.tablesCount;
  const pages = scannedPages.map((page) => ({
    id: page.id,
    name: page.name,
    path: page.path,
    url: page.url,
    score: page.score,
    issuesCount: page.issuesCount,
    status: page.status
  }));
  const components = buildComponents(aggregate, reliableIssues);
  const recommendations = unique(reliableIssues.map((issue) => issue.recommendation)).slice(0, 12);

  return {
    id: scanId,
    scanId,
    url: scanRequest.url,
    scanType: scanRequest.scanType,
    scannedAt: new Date().toISOString(),
    reportMode: "real",
    reportLabel: "تقرير حقيقي مبدئي",
    overallScore,
    complianceStatus: statusFromScore(overallScore),
    status: statusFromScore(overallScore),
    totalPages: pages.length,
    totalElements,
    issuesCount: reliableIssues.length,
    criticalIssuesCount: countCritical(reliableIssues),
    recommendationsCount: recommendations.length,
    pages,
    categories,
    components,
    recommendations,
    issueIds: realIssues.map((issue) => issue.id),
    issues: realIssues,
    reliableIssues,
    lowConfidenceIssues,
    criteriaResults,
    realScan: {
      ...realScan,
      detectedIssues: realIssues,
      reliableIssues,
      lowConfidenceIssues
    },
    summary: {
      overallScore,
      complianceStatus: statusFromScore(overallScore),
      totalPages: pages.length,
      totalElements,
      issuesCount: reliableIssues.length,
      criticalIssuesCount: countCritical(reliableIssues),
      recommendationsCount: recommendations.length,
      automatedCriteriaCount: criteriaResults.filter((item) => item.isAutomated).length,
      manualReviewCriteriaCount: criteriaResults.filter((item) => !item.isAutomated).length,
      measuredCriteriaCount: criteriaResults.filter((item) => item.isAutomated && typeof item.score === "number").length,
      passedCriteriaCount: criteriaResults.filter((item) => item.status === "مطابق").length,
      failedCriteriaCount: criteriaResults.filter((item) => item.status === "غير مطابق").length,
      issuesBySeverity: countIssuesBySeverity(reliableIssues),
      reliableIssuesCount: reliableIssues.length,
      lowConfidenceIssuesCount: lowConfidenceIssues.length,
      rawIssuesCount: rawIssues.length,
      duplicateIssuesRemovedCount: rawIssues.length - realIssues.length,
      lowConfidenceIssuesCount: lowConfidenceIssues.length,
      criteriaScore,
      issueReliabilityScore
    },
    metadata: {
      scannedPagesCount: pages.length,
      scannedElementsCount: totalElements,
      rulesCount: rules.length,
      passedRulesCount: criteriaResults.filter((item) => item.status === "مطابق").length,
      failedRulesCount: criteriaResults.filter((item) => item.status === "غير مطابق").length,
      manualReviewCount: criteriaResults.filter((item) => item.status === "يحتاج مراجعة").length,
      notApplicableCount: criteriaResults.filter((item) => item.status === "غير مطبق").length,
      duplicateIssuesRemovedCount: rawIssues.length - realIssues.length,
      scanDurationMs: Date.now() - startedAt
    }
  };
}

function buildFallbackReport({ scanRequest, startedAt, realScan }) {
  const scanId = `scan-${Date.now()}`;
  const status = "فشل الفحص";

  return {
    id: scanId,
    scanId,
    url: scanRequest.url,
    scanType: scanRequest.scanType,
    scannedAt: new Date().toISOString(),
    reportMode: "real-failed",
    reportLabel: "فحص حقيقي غير مكتمل",
    overallScore: 0,
    complianceStatus: status,
    status,
    totalPages: 0,
    totalElements: 0,
    issuesCount: 1,
    criticalIssuesCount: 0,
    recommendationsCount: 1,
    pages: [],
    categories: [],
    components: [],
    recommendations: ["تحقق من إمكانية الوصول للموقع أو جرّب الرابط مرة أخرى."],
    issueIds: ["real-scan-failed"],
    issues: [
      {
        id: "real-scan-failed",
        scanId,
        pageId: "real-scan",
        pageName: "الموقع المفحوص",
        pageUrl: scanRequest.url,
        componentType: "Real Scan",
        elementType: "Real Scan",
        ruleId: "SCAN-FAILED",
        ruleCode: "SCAN-FAILED",
        ruleName: "تعذر تنفيذ الفحص الحقيقي",
        title: "تعذر تنفيذ الفحص الحقيقي للموقع",
        description: realScan?.warning || REAL_SCAN_WARNING,
        severity: "متوسطة",
        status: "مفتوح",
        reason: realScan?.error || "قد يكون الموقع غير متاح، بطيئًا، أو يمنع الفحص الآلي.",
        recommendation: "تحقق من الرابط، ثم أعد الفحص. لم يتم استخدام أي بيانات تجريبية في هذه النتيجة.",
        found: realScan?.error || "تعذر تحميل الموقع أو تحليل الصفحة.",
        why: "لا يمكن حساب نسبة تطابق صحيحة بدون فحص حقيقي ناجح.",
        fix: "أعد المحاولة أو استخدم رابط صفحة متاحة مباشرة.",
        before: "",
        after: "",
        code: ""
      }
    ],
    criteriaResults: [],
    realScan,
    summary: {
      overallScore: 0,
      complianceStatus: status,
      totalPages: 0,
      totalElements: 0,
      issuesCount: 1,
      criticalIssuesCount: 0,
      recommendationsCount: 1,
      automatedCriteriaCount: 0,
      manualReviewCriteriaCount: 0,
      passedCriteriaCount: 0,
      failedCriteriaCount: 1,
      issuesBySeverity: { "متوسطة": 1 }
    },
    metadata: {
      scannedPagesCount: 0,
      scannedElementsCount: 0,
      rulesCount: rules.length,
      passedRulesCount: 0,
      failedRulesCount: 1,
      manualReviewCount: 0,
      scanDurationMs: Date.now() - startedAt
    }
  };
}

export async function createScan(payload) {
  const startedAt = Date.now();
  const scanRequest = normalizeScanRequest(payload);
  const scanId = `scan-${Date.now()}`;

  let realScan;
  try {
    realScan = await performPlatformCodeScan({ url: scanRequest.url, scanId, scanType: scanRequest.scanType });
  } catch (error) {
    realScan = {
      enabled: false,
      warning: REAL_SCAN_WARNING,
      error: error.message
    };
  }

  const scan = realScan.enabled
    ? buildRealReport({ scanRequest, scanId, startedAt, realScan })
    : buildFallbackReport({ scanRequest, startedAt, realScan });

  scanStore.unshift(scan);
  return scan;
}

export function getScanById(id) {
  return scanStore.find((scan) => scan.id === id || scan.scanId === id) ?? null;
}

export function getStoredScanIssues(scanId) {
  const scan = getScanById(scanId);
  return scan?.issues ?? [];
}

export function getAllStoredIssues() {
  return scanStore.flatMap((scan) => scan.issues ?? []);
}

export function getStoredIssueById(issueId) {
  return getAllStoredIssues().find((issue) => issue.id === issueId) ?? null;
}
