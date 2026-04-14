import type { Reporter, DriftReport, DriftIssue, DriftCategory } from '../types.js';

const CATEGORY_LABELS: Record<DriftCategory, string> = {
  'command': 'Commands',
  'file-path': 'File Paths',
  'env-var': 'Environment Variables',
  'url': 'URLs & Links',
  'version': 'Runtime Versions',
  'dependency': 'Dependencies',
  'api-route': 'API Endpoints',
  'semantic': 'Semantic Drift',
  'completeness': 'Completeness',
  'example': 'Outdated Examples',
  'architecture': 'Architecture',
  'response-shape': 'Response Shapes',
};

function severityIcon(severity: string): string {
  switch (severity) {
    case 'error': return '❌';
    case 'warning': return '⚠️';
    case 'info': return 'ℹ️';
    default: return '•';
  }
}

function formatIssue(issue: DriftIssue): string {
  let line = `- ${severityIcon(issue.severity)} **${issue.source.file}:${issue.source.line}** — ${issue.message}`;
  if (issue.suggestion) {
    line += `\n  - 💡 ${issue.suggestion}`;
  }
  return line;
}

export class MarkdownReporter implements Reporter {
  format = 'markdown' as const;

  render(report: DriftReport): string {
    const lines: string[] = [];
    const { summary } = report;

    lines.push('## 🔍 Stale: Documentation Drift Report');
    lines.push('');
    lines.push('| Metric | Count |');
    lines.push('|--------|-------|');
    lines.push(`| ❌ Errors | ${summary.errors} |`);
    lines.push(`| ⚠️ Warnings | ${summary.warnings} |`);
    lines.push(`| ✅ Passed | ${summary.passed} |`);
    lines.push('');

    if (report.issues.length === 0) {
      lines.push('✅ **No documentation drift detected!**');
      return lines.join('\n');
    }

    // Group by category
    const grouped = new Map<DriftCategory, DriftIssue[]>();
    for (const issue of report.issues) {
      const list = grouped.get(issue.category) ?? [];
      list.push(issue);
      grouped.set(issue.category, list);
    }

    for (const [category, issues] of grouped) {
      const label = CATEGORY_LABELS[category] ?? category;
      const errorCount = issues.filter((i) => i.severity === 'error').length;
      const warnCount = issues.filter((i) => i.severity === 'warning').length;

      lines.push(`<details>`);
      lines.push(`<summary><strong>${label}</strong> — ${errorCount} errors, ${warnCount} warnings</summary>`);
      lines.push('');
      for (const issue of issues) {
        lines.push(formatIssue(issue));
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    lines.push('---');
    lines.push(`*Scanned ${report.docsScanned.length} docs in ${report.duration}ms*`);

    return lines.join('\n');
  }
}
