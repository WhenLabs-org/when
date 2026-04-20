import type { PackageInfo, DependencyType } from '../types.js';

export type PolicyAction = 'allow' | 'block' | 'warn';

export interface PolicyCondition {
  type:
    | 'license-id'
    | 'license-category'
    | 'license-pattern'
    | 'package-name'
    | 'confidence'
    | 'any';
  values: string[];
  pattern?: string;
  /** Numeric threshold for type='confidence': matches when pkg confidence < threshold. */
  threshold?: number;
  negate?: boolean;
}

export interface ParsedPolicyRule {
  id: string;
  action: PolicyAction;
  condition: PolicyCondition;
  scope?: DependencyType[];
  originalText: string;
  notes?: string;
}

export interface ParsedPolicy {
  rules: ParsedPolicyRule[];
  sourceHash: string;
  parsedAt: string;
  defaultAction: PolicyAction;
}

export interface PolicyOverride {
  package: string;
  action: PolicyAction;
  reason: string;
}

export interface PackageCheckResult {
  pkg: PackageInfo;
  matchedRule: ParsedPolicyRule | null;
  action: PolicyAction;
  explanation: string;
  dependencyPath: string[];
}

export interface CheckResult {
  policy: ParsedPolicy;
  packages: PackageCheckResult[];
  blocked: PackageCheckResult[];
  warnings: PackageCheckResult[];
  allowed: PackageCheckResult[];
  passed: boolean;
  summary: {
    total: number;
    blocked: number;
    warnings: number;
    allowed: number;
  };
}
