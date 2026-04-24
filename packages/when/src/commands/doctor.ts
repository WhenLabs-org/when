import { Command } from 'commander';
import { runAllScans, type ScanRollup } from '../utils/scan-runner.js';
import { c, colorize } from '../utils/colors.js';

function statusIcon(r: ScanRollup): string {
  switch (r.status) {
    case 'ok': return colorize('\u2713', c.green);
    case 'issues': return colorize('\u2717', c.red);
    case 'error': return colorize('!', c.yellow);
    case 'skipped': return colorize('-', c.dim);
  }
}

function printReport(results: ScanRollup[]): void {
  console.log('');
  console.log(colorize('  WhenLabs Health Report', c.bold));
  console.log(colorize('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', c.dim));

  for (const r of results) {
    const icon = statusIcon(r);
    const label = r.label.padEnd(20);
    const detail = r.status === 'skipped'
      ? colorize(r.detail, c.dim)
      : r.status === 'ok'
        ? colorize(r.detail, c.green)
        : colorize(r.detail, r.status === 'error' ? c.yellow : c.red);
    console.log(`  ${icon}  ${label} ${detail}`);
  }

  console.log(colorize('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', c.dim));

  const hasIssues = results.some(r => r.status === 'issues' || r.status === 'error');
  const totalIssues = results.reduce((sum, r) => sum + r.issues, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings, 0);

  if (hasIssues) {
    console.log(colorize(`  ${totalIssues} issue(s), ${totalWarnings} warning(s) found`, c.red, c.bold));
  } else {
    console.log(colorize('  All checks passed', c.green, c.bold));
  }
  console.log('');
}

interface JsonOutput {
  timestamp: string;
  clean: boolean;
  totalIssues: number;
  totalWarnings: number;
  tools: Array<{
    name: string;
    status: string;
    issues: number;
    warnings: number;
    detail: string;
    exitCode: number;
  }>;
}

/** Compact hook-friendly output: one line per non-clean tool. Empty
 *  string when every scanner is `ok` or `skipped`. Exported for tests;
 *  consumed by the doctor --brief path. */
export function formatBrief(results: ScanRollup[]): string {
  const lines: string[] = [];
  for (const r of results) {
    if (r.status === 'ok' || r.status === 'skipped') continue;
    lines.push(`${r.name}: ${r.detail}`);
  }
  return lines.join('\n');
}

export function createDoctorCommand(): Command {
  const cmd = new Command('doctor');
  cmd.description('Run all WhenLabs tools and display a unified health report');
  cmd.option('--json', 'Output machine-readable JSON');
  cmd.option('--brief', 'One-line summary per non-clean tool; empty when all clean. Exits 0 always (hook-safe).');

  cmd.action(async (options: { json?: boolean; brief?: boolean }) => {
    const cwd = process.cwd();

    if (!options.json && !options.brief) {
      process.stdout.write(colorize('  Running health checks\u2026', c.dim) + '\n');
    }

    const results = await runAllScans(cwd);

    const hasIssues = results.some(r => r.status === 'issues' || r.status === 'error');

    if (options.brief) {
      // Hook-safe: print nothing when clean, never fail.
      const brief = formatBrief(results);
      if (brief) process.stdout.write(brief + '\n');
      process.exit(0);
      return;
    }

    if (options.json) {
      const output: JsonOutput = {
        timestamp: new Date().toISOString(),
        clean: !hasIssues,
        totalIssues: results.reduce((sum, r) => sum + r.issues, 0),
        totalWarnings: results.reduce((sum, r) => sum + r.warnings, 0),
        tools: results.map(r => ({
          name: r.name,
          status: r.status,
          issues: r.issues,
          warnings: r.warnings,
          detail: r.detail,
          exitCode: r.exitCode,
        })),
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      process.stdout.write('\x1b[1A\x1b[2K');
      printReport(results);
    }

    process.exit(hasIssues ? 1 : 0);
  });

  return cmd;
}
