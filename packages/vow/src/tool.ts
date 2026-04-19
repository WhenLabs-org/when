import type {
  Finding,
  ScanOptions as CoreScanOptions,
  ScanResult as CoreScanResult,
  Severity,
  Tool,
} from '@whenlabs/core';
import { schemaVersion } from '@whenlabs/core';
import { executeScan, type ScanOptions as VowScanOptions } from './commands/scan.js';
import type { PackageInfo, ScanResult as VowScanResult } from './types.js';

const TOOL_NAME = 'vow';

function severityForPackage(pkg: PackageInfo): Severity | null {
  if (pkg.license.category === 'unknown') return 'warning';
  if (pkg.license.category === 'custom') return 'info';
  return null;
}

function ruleIdForPackage(pkg: PackageInfo): string {
  if (pkg.license.category === 'unknown') return 'unknown-license';
  if (pkg.license.category === 'custom') return 'custom-license';
  return 'license';
}

function buildFindings(result: VowScanResult): Finding[] {
  const findings: Finding[] = [];
  for (const pkg of result.packages) {
    const severity = severityForPackage(pkg);
    if (!severity) continue;
    const licenseLabel = pkg.license.spdxExpression ?? 'UNKNOWN';
    const ruleId = ruleIdForPackage(pkg);
    const message =
      severity === 'warning'
        ? `${pkg.name}@${pkg.version} has an unknown license`
        : `${pkg.name}@${pkg.version} uses a custom license (${licenseLabel})`;
    const finding: Finding = {
      tool: TOOL_NAME,
      ruleId,
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
    if (pkg.path) {
      finding.location = { file: pkg.path };
    }
    findings.push(finding);
  }
  return findings;
}

function toCoreResult(
  native: VowScanResult,
  startedAt: string,
  durationMs: number,
): CoreScanResult {
  const findings = buildFindings(native);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
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
      extra: {
        totalPackages: native.summary.total,
        unknown: native.summary.unknown,
        custom: native.summary.custom,
        byLicense: Object.fromEntries(native.summary.byLicense),
        byCategory: Object.fromEntries(native.summary.byCategory),
      },
    },
    timing: { startedAt, durationMs },
    raw: native,
  };
}

export function createTool(): Tool {
  return {
    name: TOOL_NAME,
    description:
      'Scan dependency trees and surface unknown or custom license findings',
    async scan(opts?: CoreScanOptions): Promise<CoreScanResult> {
      const startedAt = new Date().toISOString();
      const start = Date.now();
      const passthrough = (opts?.options ?? {}) as Partial<VowScanOptions>;
      const vowOpts: VowScanOptions = {
        path: opts?.cwd ?? passthrough.path ?? process.cwd(),
        depth: passthrough.depth,
        production: passthrough.production ?? false,
        format: passthrough.format ?? 'terminal',
        output: passthrough.output,
      };
      const native = await executeScan(vowOpts);
      return toCoreResult(native, startedAt, Date.now() - start);
    },
  };
}
