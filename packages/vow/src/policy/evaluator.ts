import type { ScanResult, PackageInfo } from '../types.js';
import { pkgKey } from '../types.js';
import type {
  ParsedPolicy,
  ParsedPolicyRule,
  PolicyAction,
  CheckResult,
  PackageCheckResult,
  PolicyOverride,
} from './types.js';
import { extractLicenseIds } from '../license/spdx.js';
import { compilePattern } from './ignore.js';

export interface EvaluateOptions {
  overrides?: PolicyOverride[];
  /** Glob patterns (from .vowignore or --ignore) matched against package names. */
  ignorePatterns?: string[];
}

export function evaluatePolicy(
  scanResult: ScanResult,
  policy: ParsedPolicy,
  overridesOrOptions: PolicyOverride[] | EvaluateOptions = [],
): CheckResult {
  const options: EvaluateOptions = Array.isArray(overridesOrOptions)
    ? { overrides: overridesOrOptions }
    : overridesOrOptions;
  const overrides = options.overrides ?? [];
  const ignorePatterns = options.ignorePatterns ?? [];
  const compiledIgnores = ignorePatterns.map(compilePattern);

  const overrideMap = new Map<string, PolicyOverride>();
  for (const ov of overrides) {
    overrideMap.set(ov.package, ov);
  }

  const packages: PackageCheckResult[] = [];
  const blocked: PackageCheckResult[] = [];
  const warnings: PackageCheckResult[] = [];
  const allowed: PackageCheckResult[] = [];

  for (const pkg of scanResult.packages) {
    // Check .vowignore / --ignore first — a matched package is always allowed
    // regardless of policy rules or registered overrides.
    const ignoreHit = compiledIgnores.find((r) => r.test(pkg.name));
    if (ignoreHit) {
      const result: PackageCheckResult = {
        pkg,
        matchedRule: null,
        action: 'allow',
        explanation: `Ignored by pattern /${ignoreHit.source}/`,
        dependencyPath: getDependencyPath(scanResult, pkg),
      };
      packages.push(result);
      allowed.push(result);
      continue;
    }

    // Check overrides
    const overrideKey = `${pkg.name}@${pkg.version}`;
    const override = overrideMap.get(overrideKey);

    let result: PackageCheckResult;

    if (override) {
      result = {
        pkg,
        matchedRule: null,
        action: override.action,
        explanation: `Override: ${override.reason}`,
        dependencyPath: getDependencyPath(scanResult, pkg),
      };
    } else {
      const evaluation = evaluatePackage(pkg, policy.rules, policy.defaultAction);
      result = {
        pkg,
        matchedRule: evaluation.matchedRule,
        action: evaluation.action,
        explanation: evaluation.explanation,
        dependencyPath: getDependencyPath(scanResult, pkg),
      };
    }

    packages.push(result);
    switch (result.action) {
      case 'block':
        blocked.push(result);
        break;
      case 'warn':
        warnings.push(result);
        break;
      case 'allow':
        allowed.push(result);
        break;
    }
  }

  return {
    policy,
    packages,
    blocked,
    warnings,
    allowed,
    passed: blocked.length === 0,
    summary: {
      total: packages.length,
      blocked: blocked.length,
      warnings: warnings.length,
      allowed: allowed.length,
    },
  };
}

export function evaluatePackage(
  pkg: PackageInfo,
  rules: ParsedPolicyRule[],
  defaultAction: PolicyAction,
): { matchedRule: ParsedPolicyRule | null; action: PolicyAction; explanation: string } {
  for (const rule of rules) {
    // Check scope
    if (rule.scope && rule.scope.length > 0) {
      if (!rule.scope.includes(pkg.dependencyType)) {
        continue;
      }
    }

    const matched = matchCondition(pkg, rule);

    if (matched) {
      return {
        matchedRule: rule,
        action: rule.action,
        explanation: rule.originalText
          ? `Matched rule: "${rule.originalText}"`
          : `Matched rule ${rule.id} (${rule.action})`,
      };
    }
  }

  return {
    matchedRule: null,
    action: defaultAction,
    explanation: `No matching rule; default action: ${defaultAction}`,
  };
}

function matchCondition(pkg: PackageInfo, rule: ParsedPolicyRule): boolean {
  const { condition } = rule;
  let matched = false;

  switch (condition.type) {
    case 'license-id':
      matched = matchLicenseId(pkg, condition.values, rule.action);
      break;

    case 'license-category':
      matched = condition.values.some(
        cat => cat.toLowerCase() === pkg.license.category.toLowerCase(),
      );
      break;

    case 'license-pattern': {
      const pattern = (condition.pattern ?? condition.values[0] ?? '').toLowerCase();
      if (!pattern) break;

      const expr = pkg.license.spdxExpression;
      if (expr) {
        matched = expr.toLowerCase().includes(pattern);
      } else if (pattern === 'unknown' || pattern === 'none') {
        matched = true;
      }
      break;
    }

    case 'package-name':
      matched = condition.values.some(
        name => name.toLowerCase() === pkg.name.toLowerCase(),
      );
      break;

    case 'confidence': {
      const threshold = condition.threshold
        ?? (condition.pattern != null ? parseFloat(condition.pattern) : NaN);
      if (Number.isFinite(threshold)) {
        matched = pkg.license.confidence < threshold;
      }
      break;
    }

    case 'any':
      matched = true;
      break;
  }

  // Apply negation
  if (condition.negate) {
    matched = !matched;
  }

  return matched;
}

function matchLicenseId(pkg: PackageInfo, ruleValues: string[], action: PolicyAction): boolean {
  const expr = pkg.license.spdxExpression;
  if (!expr) return false;

  const ruleValuesLower = new Set(ruleValues.map(v => v.toLowerCase()));

  // Extract all license IDs from the expression
  const licenseIds = extractLicenseIds(expr);
  if (licenseIds.length === 0) {
    // Simple expression, just check the whole thing
    return ruleValuesLower.has(expr.toLowerCase());
  }

  if (licenseIds.length === 1) {
    return ruleValuesLower.has(licenseIds[0]!.toLowerCase());
  }

  // Compound expression — apply OR/AND semantics
  // For compound SPDX "OR" expressions:
  //   - allow: allowed if ANY branch is in allowed set (user can choose)
  //   - block: blocked only if ALL branches are blocked (if user can choose a non-blocked one, it's fine)
  // This is the legally correct interpretation.

  // We check if the expression contains "OR" to determine semantics
  const isOrExpression = expr.toUpperCase().includes(' OR ');

  if (isOrExpression) {
    if (action === 'allow') {
      // ANY license in the OR expression matches -> allowed
      return licenseIds.some(id => ruleValuesLower.has(id.toLowerCase()));
    } else {
      // ALL licenses in the OR expression must match -> blocked
      // (if user can choose a non-blocked license, it's fine)
      return licenseIds.every(id => ruleValuesLower.has(id.toLowerCase()));
    }
  }

  // AND expression: ALL licenses must match
  if (action === 'allow') {
    return licenseIds.every(id => ruleValuesLower.has(id.toLowerCase()));
  } else {
    return licenseIds.some(id => ruleValuesLower.has(id.toLowerCase()));
  }
}

function getDependencyPath(scanResult: ScanResult, pkg: PackageInfo): string[] {
  const key = pkgKey(pkg.name, pkg.version);
  const node = scanResult.graph.get(key);
  if (!node) return [];

  // Walk dependents to build path
  const path: string[] = [];
  let current = node;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(pkgKey(current.pkg.name, current.pkg.version))) break;
    visited.add(pkgKey(current.pkg.name, current.pkg.version));

    if (current.dependents.size === 0) break;

    const [depName, depVersion] = current.dependents.entries().next().value as [string, string];
    path.push(`${depName}@${depVersion}`);

    const parentKey = pkgKey(depName, depVersion);
    const parentNode = scanResult.graph.get(parentKey);
    if (!parentNode) break;
    current = parentNode;
  }

  return path;
}
