// Programmatic API
export { DepGraph, buildGraph } from './graph/builder.js';
export { walkGraph, filterByLicense, filterByCategory } from './graph/walker.js';
export { visualizeTree } from './graph/visualizer.js';
export { NpmResolver } from './resolvers/npm.js';
export { BaseResolver } from './resolvers/base.js';
export { classifyLicenseText } from './license/classifier.js';
export { getLicenseCategory, isPermissive, isCopyleft, isStronglyCopyleft } from './license/categories.js';
export { normalizeLicenseId, isValidSpdxId, getLicenseById, getAllLicenses } from './license/database.js';
export { parseSpdxExpression, extractLicenseIds, satisfies, isSpdxExpression } from './license/spdx.js';
export { executeScan } from './commands/scan.js';
export { parsePolicy } from './policy/parser.js';
export { evaluatePolicy } from './policy/evaluator.js';
export { createPolicyCache, hashPolicyText } from './policy/cache.js';
export { reportScanSummary, reportCheckResult, reportFixSuggestions } from './reporters/terminal.js';
export { toJSON } from './reporters/json.js';
export { toCSV } from './reporters/csv.js';
export { toMarkdown, toMarkdownCheckResult } from './reporters/markdown.js';
export { pkgKey, scanResultToJSON } from './types.js';

// Types
export type {
  PackageInfo,
  LicenseResult,
  LicenseSource,
  LicenseCategory,
  DependencyType,
  DepGraphNode,
  ScanResult,
  ScanResultJSON,
  LicenseSummary,
} from './types.js';

export type {
  ParsedPolicyRule,
  ParsedPolicy,
  PolicyCondition,
  PolicyAction,
  PolicyConfig,
  PolicyOverride,
  PackageCheckResult,
  CheckResult,
} from './policy/types.js';

export type { ResolverOptions, ResolvedPackage } from './resolvers/base.js';
