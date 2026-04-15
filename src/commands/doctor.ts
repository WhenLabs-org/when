import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ANSI color helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function colorize(text: string, ...codes: string[]): string {
  return codes.join('') + text + c.reset;
}

function findBin(name: string): string {
  const pkgRoot = resolve(__dirname, '..');
  const localBin = resolve(pkgRoot, 'node_modules', '.bin', name);
  if (existsSync(localBin)) return localBin;
  return name;
}

interface ToolResult {
  name: string;
  label: string;
  issues: number;
  warnings: number;
  status: 'ok' | 'issues' | 'error' | 'skipped';
  detail: string;
  exitCode: number;
}

function runTool(bin: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolveP) => {
    const child = spawn(bin, args, {
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('error', () => {
      resolveP({ stdout, stderr, exitCode: 127 });
    });

    child.on('close', (code) => {
      resolveP({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

async function checkStale(cwd: string): Promise<ToolResult> {
  const bin = findBin('stale');
  const { stdout, exitCode } = await runTool(bin, ['scan', '--format', 'json', '--path', cwd]);

  try {
    const json = JSON.parse(stdout) as {
      issues?: Array<{ severity: string }>;
      summary?: { errors: number; warnings: number };
    };
    const errors = json.summary?.errors ?? json.issues?.filter(i => i.severity === 'error').length ?? 0;
    const warnings = json.summary?.warnings ?? json.issues?.filter(i => i.severity === 'warning').length ?? 0;
    const total = errors + warnings;
    return {
      name: 'stale',
      label: 'stale scan',
      issues: errors,
      warnings,
      status: errors > 0 ? 'issues' : warnings > 0 ? 'issues' : 'ok',
      detail: total === 0 ? 'No documentation drift detected' : `${errors} error(s), ${warnings} warning(s)`,
      exitCode,
    };
  } catch {
    return { name: 'stale', label: 'stale scan', issues: 0, warnings: 0, status: 'error', detail: 'Failed to parse output', exitCode };
  }
}

async function checkEnvalid(cwd: string): Promise<ToolResult> {
  const bin = findBin('envalid');
  const { stdout, exitCode } = await runTool(bin, ['validate', '--format', 'json']);

  // Exit code 2 = schema not found (not configured — treat as skipped)
  if (exitCode === 2 || stdout.includes('Schema file not found') || stdout.includes('not found')) {
    return { name: 'envalid', label: 'envalid validate', issues: 0, warnings: 0, status: 'skipped', detail: 'No .env.schema found — run `envalid init`', exitCode };
  }

  try {
    const json = JSON.parse(stdout) as {
      summary?: { errors: number; warnings: number };
      issues?: Array<{ severity: string }>;
    };
    const errors = json.summary?.errors ?? json.issues?.filter((i) => i.severity === 'error').length ?? 0;
    const warnings = json.summary?.warnings ?? json.issues?.filter((i) => i.severity === 'warning').length ?? 0;
    return {
      name: 'envalid',
      label: 'envalid validate',
      issues: errors,
      warnings,
      status: errors > 0 ? 'issues' : warnings > 0 ? 'issues' : 'ok',
      detail: errors + warnings === 0 ? '.env is valid' : `${errors} error(s), ${warnings} warning(s)`,
      exitCode,
    };
  } catch {
    return { name: 'envalid', label: 'envalid validate', issues: 0, warnings: 0, status: 'error', detail: 'Failed to parse output', exitCode };
  }
}

async function checkBerth(cwd: string): Promise<ToolResult> {
  const bin = findBin('berth');
  const { stdout, exitCode } = await runTool(bin, ['check', cwd, '--json']);

  try {
    const json = JSON.parse(stdout) as { conflicts?: unknown[] };
    const conflicts = json.conflicts?.length ?? 0;
    return {
      name: 'berth',
      label: 'berth check',
      issues: conflicts,
      warnings: 0,
      status: conflicts > 0 ? 'issues' : 'ok',
      detail: conflicts === 0 ? 'No port conflicts' : `${conflicts} port conflict(s)`,
      exitCode,
    };
  } catch {
    return { name: 'berth', label: 'berth check', issues: 0, warnings: 0, status: 'error', detail: 'Failed to parse output', exitCode };
  }
}

async function checkVow(cwd: string): Promise<ToolResult> {
  const bin = findBin('vow');
  const { stdout, exitCode } = await runTool(bin, ['scan', '--format', 'json', '--path', cwd]);

  // Strip any non-JSON lines before the first `{`
  const jsonStart = stdout.indexOf('{');
  const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;

  try {
    const json = JSON.parse(jsonStr) as {
      packages?: Array<{ license?: { category?: string } }>;
      summary?: { violations?: number; warnings?: number };
    };
    // vow scan just lists packages; violations require `vow check` with a policy
    // Count copyleft as potential warnings
    const copyleft = json.packages?.filter(p => p.license?.category === 'copyleft').length ?? 0;
    const unknown = json.packages?.filter(p => !p.license?.category || p.license.category === 'unknown').length ?? 0;
    const total = json.packages?.length ?? 0;
    const issues = json.summary?.violations ?? 0;
    const warnings = json.summary?.warnings ?? copyleft + unknown;
    return {
      name: 'vow',
      label: 'vow scan',
      issues,
      warnings,
      status: issues > 0 ? 'issues' : warnings > 0 ? 'issues' : 'ok',
      detail: total === 0 ? 'No packages found' : issues + warnings === 0
        ? `${total} packages, all permissive`
        : `${total} packages — ${copyleft} copyleft, ${unknown} unknown`,
      exitCode,
    };
  } catch {
    return { name: 'vow', label: 'vow scan', issues: 0, warnings: 0, status: 'error', detail: 'Failed to parse output', exitCode };
  }
}

async function checkAware(): Promise<ToolResult> {
  const bin = findBin('aware');
  const { stdout, stderr, exitCode } = await runTool(bin, ['doctor']);

  const combined = (stdout + stderr).trim();

  if (exitCode !== 0) {
    // Try to extract a meaningful summary
    const notFound = combined.includes('.aware.json not found');
    if (notFound) {
      return { name: 'aware', label: 'aware doctor', issues: 0, warnings: 0, status: 'skipped', detail: 'No .aware.json found — run `aware init`', exitCode };
    }
    // Count lines that look like errors (lines with ✗ or "error")
    const errorLines = combined.split('\n').filter(l => l.includes('✗') || /error/i.test(l)).length;
    return {
      name: 'aware',
      label: 'aware doctor',
      issues: errorLines,
      warnings: 0,
      status: 'issues',
      detail: `${errorLines} issue(s) detected`,
      exitCode,
    };
  }

  const warnLines = combined.split('\n').filter(l => l.includes('⚠') || /warn/i.test(l)).length;
  const okLines = combined.split('\n').filter(l => l.includes('✓') || l.includes('✔')).length;
  return {
    name: 'aware',
    label: 'aware doctor',
    issues: 0,
    warnings: warnLines,
    status: warnLines > 0 ? 'issues' : 'ok',
    detail: warnLines > 0 ? `${warnLines} warning(s)` : `${okLines} check(s) passed`,
    exitCode,
  };
}

function statusIcon(result: ToolResult): string {
  switch (result.status) {
    case 'ok': return colorize('✓', c.green);
    case 'issues': return colorize('✗', c.red);
    case 'error': return colorize('!', c.yellow);
    case 'skipped': return colorize('-', c.dim);
  }
}

function printReport(results: ToolResult[]): void {
  console.log('');
  console.log(colorize('  WhenLabs Health Report', c.bold));
  console.log(colorize('  ─────────────────────────────────────────', c.dim));

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

  console.log(colorize('  ─────────────────────────────────────────', c.dim));

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

export function createDoctorCommand(): Command {
  const cmd = new Command('doctor');
  cmd.description('Run all WhenLabs tools and display a unified health report');
  cmd.option('--json', 'Output machine-readable JSON');

  cmd.action(async (options: { json?: boolean }) => {
    const cwd = process.cwd();

    if (!options.json) {
      process.stdout.write(colorize('  Running health checks…', c.dim) + '\n');
    }

    const results = await Promise.all([
      checkStale(cwd),
      checkEnvalid(cwd),
      checkBerth(cwd),
      checkVow(cwd),
      checkAware(),
    ]);

    const hasIssues = results.some(r => r.status === 'issues' || r.status === 'error');

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
      // Clear the "Running…" line
      process.stdout.write('\x1b[1A\x1b[2K');
      printReport(results);
    }

    process.exit(hasIssues ? 1 : 0);
  });

  return cmd;
}
