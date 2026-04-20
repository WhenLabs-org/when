import chalk from 'chalk';
import Table from 'cli-table3';
import type { ScanResult } from '../types.js';
import type { CheckResult, PackageCheckResult } from '../policy/types.js';

export function reportScanSummary(result: ScanResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold(`── License Summary ${'─'.repeat(42)}`));
  lines.push('');

  // Sort licenses by count descending
  const sorted = [...result.summary.byLicense.entries()]
    .sort((a, b) => b[1] - a[1]);

  const table = new Table({
    head: ['License', 'Count', '%'],
    colAligns: ['left', 'right', 'right'],
    style: { head: ['cyan'], border: ['gray'] },
  });

  for (const [license, count] of sorted) {
    const pct = ((count / result.summary.total) * 100).toFixed(1);
    table.push([license, count.toString(), `${pct}%`]);
  }

  lines.push(table.toString());
  lines.push('');
  lines.push(`  Total: ${chalk.bold(result.summary.total.toString())} packages across ${result.ecosystems.join(', ')}`);

  // Attention section
  const attention: string[] = [];
  const copyleftCount = (result.summary.byCategory.get('strongly-copyleft') ?? 0)
    + (result.summary.byCategory.get('network-copyleft') ?? 0);

  if (copyleftCount > 0) {
    attention.push(`  ${chalk.red('✗')} ${copyleftCount} packages with copyleft licenses`);
  }
  if (result.summary.unknown > 0) {
    attention.push(`  ${chalk.yellow('⚠')} ${result.summary.unknown} packages with unknown license`);
  }
  if (result.summary.custom > 0) {
    attention.push(`  ${chalk.yellow('⚠')} ${result.summary.custom} packages with custom/non-SPDX license`);
  }

  if (attention.length > 0) {
    lines.push('');
    lines.push(chalk.bold(`── Attention Required ${'─'.repeat(39)}`));
    lines.push(...attention);
  }

  lines.push('');
  return lines.join('\n');
}

export function reportCheckResult(result: CheckResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`Policy: ${chalk.bold(result.policy.rules.length.toString())} rules`);
  lines.push('');

  if (result.blocked.length > 0) {
    lines.push(chalk.bold.red(`── Policy Violations ${'─'.repeat(40)}`));
    lines.push('');
    lines.push(chalk.bold.red('BLOCKED:'));

    for (const item of result.blocked) {
      lines.push(formatViolation(item, 'block'));
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push(chalk.bold.yellow('WARNINGS:'));

    for (const item of result.warnings) {
      lines.push(formatViolation(item, 'warn'));
    }
    lines.push('');
  }

  lines.push(chalk.bold(`── Result ${'─'.repeat(51)}`));
  if (result.blocked.length > 0) {
    lines.push(`  ${chalk.red.bold(result.blocked.length.toString())} blocked ${result.blocked.length === 1 ? '(build will fail in CI)' : '(build will fail in CI)'}`);
  }
  if (result.warnings.length > 0) {
    lines.push(`  ${chalk.yellow.bold(result.warnings.length.toString())} warnings (manual review needed)`);
  }
  lines.push(`  ${chalk.green.bold(result.allowed.length.toString())} passed`);
  lines.push('');

  return lines.join('\n');
}

function formatViolation(item: PackageCheckResult, level: 'block' | 'warn'): string {
  const icon = level === 'block' ? chalk.red('✗') : chalk.yellow('⚠');
  const licenseStr = formatLicenseWithSource(item.pkg);
  const lines: string[] = [];

  lines.push(`  ${icon} ${chalk.bold(item.pkg.name)}@${item.pkg.version} (${licenseStr})`);

  if (item.dependencyPath.length > 0) {
    lines.push(`    └── Required by: ${item.dependencyPath.join(' → ')}`);
  }

  if (item.matchedRule) {
    lines.push(`    Rule: "${item.matchedRule.originalText}"`);
  }

  lines.push(`    Impact: ${item.pkg.dependencyType === 'production' ? 'Direct' : 'Transitive'} dependency`);

  return lines.join('\n');
}

function formatLicenseWithSource(pkg: import('../types.js').PackageInfo): string {
  const expr = pkg.license.spdxExpression;
  const confidence = pkg.license.confidence;
  const confidenceNote = confidence > 0 && confidence < 0.9
    ? ` ${chalk.gray(`[conf: ${confidence.toFixed(2)}]`)}`
    : '';

  if (!expr) {
    const base = pkg.license.source === 'none' ? 'UNKNOWN (no license found)' : 'UNKNOWN';
    return `${base}${confidenceNote}`;
  }
  if (pkg.license.source === 'license-file') {
    return `${expr} (resolved from LICENSE file)${confidenceNote}`;
  }
  if (pkg.license.source === 'registry-api') {
    return `${expr} (resolved from npm registry)${confidenceNote}`;
  }
  return `${expr}${confidenceNote}`;
}

