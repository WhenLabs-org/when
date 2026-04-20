import chalk from 'chalk';
import boxen from 'boxen';
import type { Reporter, DriftReport, DriftIssue, DriftCategory } from '../types.js';

const CATEGORY_LABELS: Record<DriftCategory, string> = {
  'command': 'COMMANDS',
  'file-path': 'FILE PATHS',
  'env-var': 'ENVIRONMENT VARIABLES',
  'url': 'URLS & LINKS',
  'version': 'NODE/RUNTIME VERSION',
  'dependency': 'DEPENDENCIES',
  'api-route': 'API ENDPOINTS',
  'git-staleness': 'GIT STALENESS',
  'comment-staleness': 'STALE COMMENTS',
};

const CATEGORY_CONTEXT: Record<DriftCategory, string> = {
  'command': 'checking against package.json scripts',
  'file-path': 'checking against filesystem',
  'env-var': 'checking against codebase usage',
  'url': 'checking links, ports, and badges',
  'version': 'checking against project config',
  'dependency': 'checking against package.json and docker-compose',
  'api-route': 'checking against route definitions',
  'git-staleness': 'checking doc age vs source activity',
  'comment-staleness': 'checking comment symbol references',
};

function formatIssue(issue: DriftIssue): string {
  const icon = issue.severity === 'error' ? chalk.red('✗')
    : issue.severity === 'warning' ? chalk.yellow('⚠')
    : chalk.blue('ℹ');

  const location = chalk.dim(`${issue.source.file}:${issue.source.line}`);
  let line = `  ${icon} ${location} — ${issue.message}`;

  if (issue.suggestion) {
    line += `\n    ${chalk.green(issue.suggestion)}`;
  }

  if (issue.evidence?.codeLocations?.length) {
    for (const loc of issue.evidence.codeLocations) {
      line += `\n    ${chalk.dim(`Found in ${loc.file}:${loc.line}`)}`;
    }
  }

  return line;
}

export class TerminalReporter implements Reporter {
  format = 'terminal' as const;

  render(report: DriftReport): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.bold(`Scanning project: ${report.projectPath}/`));
    lines.push(chalk.dim(`Analyzing: ${report.docsScanned.join(', ')}`));
    lines.push('');

    // Group issues by category
    const grouped = new Map<DriftCategory, DriftIssue[]>();
    for (const issue of report.issues) {
      const list = grouped.get(issue.category) ?? [];
      list.push(issue);
      grouped.set(issue.category, list);
    }

    for (const [category, issues] of grouped) {
      const label = CATEGORY_LABELS[category] ?? category.toUpperCase();
      const context = CATEGORY_CONTEXT[category];
      lines.push(chalk.bold(`${label} ${chalk.dim(`(${context})`)}`));

      for (const issue of issues) {
        lines.push(formatIssue(issue));
        lines.push('');
      }
    }

    // Summary
    const { summary } = report;
    const summaryText = [
      `${summary.errors} ${summary.errors === 1 ? 'error' : 'errors'} (docs contradict codebase)`,
      `${summary.warnings} ${summary.warnings === 1 ? 'warning' : 'warnings'} (potential issues, needs human review)`,
      `${summary.passed} checks passed`,
    ].join('\n');

    const borderColor = summary.errors > 0 ? 'red' : summary.warnings > 0 ? 'yellow' : 'green';

    lines.push(boxen(summaryText, {
      title: 'Summary',
      titleAlignment: 'left',
      padding: 1,
      borderColor,
      borderStyle: 'round',
    }));

    lines.push('');

    return lines.join('\n');
  }
}
