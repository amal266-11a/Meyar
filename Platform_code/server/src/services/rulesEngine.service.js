import { rules } from "../data/rulesCatalog.js";

export function getRules() {
  return rules;
}

export function getRulesByCategory(category) {
  return rules.filter((rule) => rule.category === category);
}

export function getRuleById(id) {
  return rules.find((rule) => rule.id === id) ?? null;
}

export function evaluateRule(rule, element = {}) {
  const failedRuleIds = Array.isArray(element.failedRuleIds) ? element.failedRuleIds : [];

  return {
    ruleId: rule.id,
    passed: !failedRuleIds.includes(rule.id),
    rule,
    element
  };
}

export function evaluatePage(page = {}, rulesToEvaluate = rules) {
  const elements = Array.isArray(page.elements) ? page.elements : [];
  const results = rulesToEvaluate.map((rule) => {
    const relatedElement = elements.find((element) => element.ruleId === rule.id) ?? {};
    return evaluateRule(rule, relatedElement);
  });

  return {
    page,
    results,
    passedRules: results.filter((result) => result.passed),
    failedRules: results.filter((result) => !result.passed)
  };
}

export function generateIssuesFromFailedRules(failedRules = []) {
  return failedRules.map((failedRule, index) => ({
    id: `generated-issue-${index + 1}`,
    ruleCode: failedRule.rule.id,
    ruleName: failedRule.rule.title,
    title: `مخالفة في معيار ${failedRule.rule.id}`,
    description: failedRule.rule.description,
    severity: failedRule.rule.severity,
    recommendation: failedRule.rule.recommendation
  }));
}
