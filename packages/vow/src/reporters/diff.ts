import chalk from 'chalk';
import type { DiffResult } from '../diff/engine.js';

function pkgLabel(name: string, ecosystem?: string): string {
  return ecosystem && ecosystem !== 'npm' ? `${name} (${ecosystem})` : name;
}

export function toDiffTerminal(result: DiffResult): string {
  const lines: string[] = [];
  const { summary } = result;

  lines.push('');
  lines.push(chalk.bold(`── License Diff ${'─'.repeat(45)}`));
  lines.push(
    `  ${result.baseline.name}@${result.baseline.version}  →  ${result.current.name}@${result.current.version}`,
  );
  lines.push('');

  if (result.added.length > 0) {
    lines.push(chalk.bold('Added:'));
    for (const e of result.added) {
      const icon = severityIcon(e.severity);
      lines.push(
        `  ${icon} + ${chalk.bold(pkgLabel(e.name, e.ecosystem))}@${e.newVersion} (${e.newLicense})`,
      );
    }
    lines.push('');
  }

  if (result.licenseChanged.length > 0) {
    lines.push(chalk.bold('License changed:'));
    for (const e of result.licenseChanged) {
      const icon = severityIcon(e.severity);
      lines.push(
        `  ${icon} ${chalk.bold(pkgLabel(e.name, e.ecosystem))}@${e.version}: ` +
          `${e.oldLicense} (${e.oldCategory}) → ${chalk.bold(e.newLicense)} (${e.newCategory})`,
      );
    }
    lines.push('');
  }

  if (result.versionChanged.length > 0) {
    lines.push(chalk.bold('Version changed:'));
    for (const e of result.versionChanged) {
      const icon = severityIcon(e.severity);
      const licenseNote = e.licenseChanged
        ? ` — license: ${e.oldLicense} → ${chalk.bold(e.newLicense)}`
        : '';
      lines.push(
        `  ${icon} ${chalk.bold(pkgLabel(e.name, e.ecosystem))}: ${e.oldVersion} → ${e.newVersion}${licenseNote}`,
      );
    }
    lines.push('');
  }

  if (result.removed.length > 0) {
    lines.push(chalk.bold('Removed:'));
    for (const e of result.removed) {
      lines.push(
        `  ${chalk.gray('-')} ${pkgLabel(e.name, e.ecosystem)}@${e.oldVersion} (${e.oldLicense})`,
      );
    }
    lines.push('');
  }

  if (summary.total === 0) {
    lines.push(chalk.gray('No changes.'));
    lines.push('');
  } else {
    lines.push(chalk.bold(`── Summary ${'─'.repeat(50)}`));
    lines.push(
      `  ${chalk.red.bold(summary.errors.toString())} errors, ` +
        `${chalk.yellow.bold(summary.warnings.toString())} warnings, ` +
        `${chalk.gray(summary.infos.toString())} info`,
    );
    lines.push('');
  }

  return lines.join('\n');
}

function severityIcon(sev: 'info' | 'warning' | 'error'): string {
  switch (sev) {
    case 'error':
      return chalk.red('✗');
    case 'warning':
      return chalk.yellow('⚠');
    default:
      return chalk.green('•');
  }
}

export function toDiffMarkdown(result: DiffResult): string {
  const { summary } = result;
  const ok = summary.errors === 0 && summary.warnings === 0;
  const icon = ok ? ':white_check_mark:' : summary.errors > 0 ? ':x:' : ':warning:';
  const lines: string[] = [];

  lines.push(`## ${icon} License Diff`);
  lines.push('');
  lines.push(
    `_${result.baseline.name}@${result.baseline.version} → ${result.current.name}@${result.current.version}_`,
  );
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('|------|------:|');
  lines.push(`| Added | ${result.added.length} |`);
  lines.push(`| Removed | ${result.removed.length} |`);
  lines.push(`| Version changed | ${result.versionChanged.length} |`);
  lines.push(`| License changed | ${result.licenseChanged.length} |`);
  lines.push(`| **Errors / Warnings / Info** | **${summary.errors} / ${summary.warnings} / ${summary.infos}** |`);
  lines.push('');

  if (result.licenseChanged.length > 0) {
    lines.push('### License changes');
    lines.push('');
    lines.push('| Package | Version | Old license | New license | Severity |');
    lines.push('|---------|---------|-------------|-------------|----------|');
    for (const e of result.licenseChanged) {
      lines.push(
        `| ${pkgLabel(e.name, e.ecosystem)} | ${e.version} | ${e.oldLicense} (${e.oldCategory}) | ${e.newLicense} (${e.newCategory}) | ${severityLabel(e.severity)} |`,
      );
    }
    lines.push('');
  }

  const licenseBumps = result.versionChanged.filter((e) => e.licenseChanged);
  if (licenseBumps.length > 0) {
    lines.push('### Version bumps with license change');
    lines.push('');
    lines.push('| Package | Old → New | License change | Severity |');
    lines.push('|---------|-----------|----------------|----------|');
    for (const e of licenseBumps) {
      lines.push(
        `| ${pkgLabel(e.name, e.ecosystem)} | ${e.oldVersion} → ${e.newVersion} | ${e.oldLicense} → ${e.newLicense} | ${severityLabel(e.severity)} |`,
      );
    }
    lines.push('');
  }

  if (result.added.length > 0) {
    lines.push('### Added');
    lines.push('');
    lines.push('| Package | Version | License | Severity |');
    lines.push('|---------|---------|---------|----------|');
    for (const e of result.added) {
      lines.push(
        `| ${pkgLabel(e.name, e.ecosystem)} | ${e.newVersion} | ${e.newLicense} (${e.newCategory}) | ${severityLabel(e.severity)} |`,
      );
    }
    lines.push('');
  }

  if (result.removed.length > 0) {
    lines.push('### Removed');
    lines.push('');
    for (const e of result.removed) {
      lines.push(`- \`${pkgLabel(e.name, e.ecosystem)}@${e.oldVersion}\` (${e.oldLicense})`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Generated by [vow diff](https://github.com/WhenLabs-org/vow)_');
  lines.push('');
  return lines.join('\n');
}

function severityLabel(s: 'info' | 'warning' | 'error'): string {
  switch (s) {
    case 'error':
      return ':x: error';
    case 'warning':
      return ':warning: warning';
    default:
      return ':information_source: info';
  }
}
