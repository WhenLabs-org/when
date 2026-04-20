import type {
  Finding,
  ScanOptions as CoreScanOptions,
  ScanResult as CoreScanResult,
  Severity,
  Tool,
} from '@whenlabs/core';
import { schemaVersion } from '@whenlabs/core';
import path from 'node:path';
import { executeScan, type ScanOptions as VowScanOptions } from './commands/scan.js';
import { evaluatePolicy } from './policy/evaluator.js';
import { loadIgnoreFile } from './policy/ignore.js';
import {
  loadJsonPolicy,
  loadYamlPolicy,
} from './policy/json-policy.js';
import type {
  CheckResult,
  PackageCheckResult,
  ParsedPolicy,
  PolicyOverride,
} from './policy/types.js';
import { pkgKey, type PackageInfo, type ScanResult as VowScanResult } from './types.js';

const TOOL_NAME = 'vow';

interface LoadedPolicy {
  policy: ParsedPolicy;
  overrides: PolicyOverride[];
  sourceFile: string;
}

interface VowToolOptions extends Partial<VowScanOptions> {
  policy?: string | 'auto' | 'off';
  /** Additional ignore patterns applied on top of .vowignore. */
  ignore?: string[];
}

async function loadPolicyIfPresent(
  projectPath: string,
  mode: string,
): Promise<LoadedPolicy | null> {
  if (mode === 'off') return null;

  if (mode !== 'auto') {
    const explicit = path.resolve(projectPath, mode);
    if (explicit.endsWith('.json')) {
      const jsonResult = await loadJsonPolicy(path.dirname(explicit));
      if (jsonResult) return { policy: jsonResult.policy, overrides: [], sourceFile: explicit };
    } else {
      const yamlResult = await loadYamlPolicy(path.dirname(explicit));
      if (yamlResult) return { policy: yamlResult.policy, overrides: [], sourceFile: explicit };
    }
    return null;
  }

  const jsonResult = await loadJsonPolicy(projectPath);
  if (jsonResult) {
    return {
      policy: jsonResult.policy,
      overrides: [],
      sourceFile: path.join(projectPath, '.vow.json'),
    };
  }

  const yamlResult = await loadYamlPolicy(projectPath);
  if (yamlResult) {
    return {
      policy: yamlResult.policy,
      overrides: [],
      sourceFile: path.join(projectPath, '.vow.yml'),
    };
  }

  return null;
}

function baselineSeverity(pkg: PackageInfo): Severity | null {
  if (pkg.license.category === 'unknown') return 'warning';
  if (pkg.license.category === 'custom') return 'info';
  return null;
}

function baselineRuleId(pkg: PackageInfo): string {
  if (pkg.license.category === 'unknown') return 'unknown-license';
  if (pkg.license.category === 'custom') return 'custom-license';
  return 'license';
}

function baselineFinding(pkg: PackageInfo): Finding | null {
  const severity = baselineSeverity(pkg);
  if (!severity) return null;
  const licenseLabel = pkg.license.spdxExpression ?? 'UNKNOWN';
  const message =
    severity === 'warning'
      ? `${pkg.name}@${pkg.version} has an unknown license`
      : `${pkg.name}@${pkg.version} uses a custom license (${licenseLabel})`;
  const finding: Finding = {
    tool: TOOL_NAME,
    ruleId: baselineRuleId(pkg),
    severity,
    message,
    data: {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      dependencyType: pkg.dependencyType,
      rawLicense: pkg.rawLicense,
    },
  };
  if (pkg.path) finding.location = { file: pkg.path };
  return finding;
}

function policyFinding(item: PackageCheckResult): Finding | null {
  if (item.action === 'allow') return null;

  const pkg = item.pkg;
  const licenseLabel = pkg.license.spdxExpression ?? 'UNKNOWN';
  const severity: Severity = item.action === 'block' ? 'error' : 'warning';
  const ruleId = item.action === 'block' ? 'policy-block' : 'policy-warn';
  const verb = item.action === 'block' ? 'blocked by policy' : 'warned by policy';
  const message = `${pkg.name}@${pkg.version} (${licenseLabel}) ${verb}`;

  const finding: Finding = {
    tool: TOOL_NAME,
    ruleId,
    severity,
    message,
    suggestion: item.explanation,
    data: {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      dependencyType: pkg.dependencyType,
      rawLicense: pkg.rawLicense,
      matchedRule: item.matchedRule,
      dependencyPath: item.dependencyPath,
    },
  };
  if (pkg.path) finding.location = { file: pkg.path };
  return finding;
}

function buildFindings(
  scan: VowScanResult,
  check: CheckResult | null,
): Finding[] {
  const findings: Finding[] = [];
  const covered = new Set<string>();

  if (check) {
    for (const item of check.packages) {
      const finding = policyFinding(item);
      if (!finding) continue;
      findings.push(finding);
      covered.add(pkgKey(item.pkg.name, item.pkg.version));
    }
  }

  for (const pkg of scan.packages) {
    if (covered.has(pkgKey(pkg.name, pkg.version))) continue;
    const finding = baselineFinding(pkg);
    if (finding) findings.push(finding);
  }

  return findings;
}

function toCoreResult(
  native: VowScanResult,
  check: CheckResult | null,
  policySourceFile: string | null,
  startedAt: string,
  durationMs: number,
): CoreScanResult {
  const findings = buildFindings(native, check);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.filter((f) => f.severity === 'info').length;

  const extra: Record<string, unknown> = {
    totalPackages: native.summary.total,
    unknown: native.summary.unknown,
    custom: native.summary.custom,
    byLicense: Object.fromEntries(native.summary.byLicense),
    byCategory: Object.fromEntries(native.summary.byCategory),
  };

  if (check) {
    extra['policy'] = {
      sourceFile: policySourceFile,
      total: check.summary.total,
      blocked: check.summary.blocked,
      warnings: check.summary.warnings,
      allowed: check.summary.allowed,
      passed: check.passed,
    };
  }

  return {
    schemaVersion,
    tool: TOOL_NAME,
    ok: errors === 0,
    project: {
      name: native.project.name,
      cwd: native.project.path,
      detectedStack: native.ecosystems,
    },
    findings,
    summary: {
      total: findings.length,
      errors,
      warnings,
      infos,
      extra,
    },
    timing: { startedAt, durationMs },
    raw: native,
  };
}

export function createTool(): Tool {
  return {
    name: TOOL_NAME,
    description:
      'Scan dependency trees and validate licenses against an allow/deny/warn policy',
    async scan(opts?: CoreScanOptions): Promise<CoreScanResult> {
      const startedAt = new Date().toISOString();
      const start = Date.now();
      const passthrough = (opts?.options ?? {}) as VowToolOptions;
      const projectPath = opts?.cwd ?? passthrough.path ?? process.cwd();
      const vowOpts: VowScanOptions = {
        path: projectPath,
        depth: passthrough.depth,
        production: passthrough.production ?? false,
        format: passthrough.format ?? 'terminal',
        output: passthrough.output,
        registry: passthrough.registry,
        registryFetch: passthrough.registryFetch,
      };
      const native = await executeScan(vowOpts);

      const policyMode = passthrough.policy ?? 'auto';
      let check: CheckResult | null = null;
      let policySourceFile: string | null = null;
      try {
        const loaded = await loadPolicyIfPresent(projectPath, policyMode);
        if (loaded) {
          const fileIgnores = await loadIgnoreFile(projectPath);
          const ignorePatterns = [...fileIgnores, ...(passthrough.ignore ?? [])];
          check = evaluatePolicy(native, loaded.policy, {
            overrides: loaded.overrides,
            ignorePatterns,
          });
          policySourceFile = loaded.sourceFile;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`vow: policy evaluation skipped — ${msg}`);
      }

      return toCoreResult(native, check, policySourceFile, startedAt, Date.now() - start);
    },
  };
}
