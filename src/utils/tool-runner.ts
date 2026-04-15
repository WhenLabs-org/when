import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ToolResult {
  name: string;
  label: string;
  issues: number;
  warnings: number;
  status: 'ok' | 'issues' | 'error' | 'skipped';
  detail: string;
  exitCode: number;
}

export function findBin(name: string): string {
  const pkgRoot = resolve(__dirname, '..', '..');
  const localBin = resolve(pkgRoot, 'node_modules', '.bin', name);
  if (existsSync(localBin)) return localBin;
  return name;
}

export function runTool(bin: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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

export async function checkStale(cwd: string): Promise<ToolResult> {
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

export async function checkEnvalid(cwd: string): Promise<ToolResult> {
  const bin = findBin('envalid');
  const { stdout, exitCode } = await runTool(bin, ['validate', '--format', 'json']);

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

export async function checkBerth(cwd: string): Promise<ToolResult> {
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

export async function checkVow(cwd: string): Promise<ToolResult> {
  const bin = findBin('vow');
  const { stdout, exitCode } = await runTool(bin, ['scan', '--format', 'json', '--path', cwd]);

  const jsonStart = stdout.indexOf('{');
  const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;

  try {
    const json = JSON.parse(jsonStr) as {
      packages?: Array<{ license?: { category?: string } }>;
      summary?: { violations?: number; warnings?: number };
    };
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

export async function checkAware(): Promise<ToolResult> {
  const bin = findBin('aware');
  const { stdout, stderr, exitCode } = await runTool(bin, ['doctor']);

  const combined = (stdout + stderr).trim();

  if (exitCode !== 0) {
    const notFound = combined.includes('.aware.json not found');
    if (notFound) {
      return { name: 'aware', label: 'aware doctor', issues: 0, warnings: 0, status: 'skipped', detail: 'No .aware.json found — run `aware init`', exitCode };
    }
    const errorLines = combined.split('\n').filter(l => l.includes('\u2717') || /error/i.test(l)).length;
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

  const warnLines = combined.split('\n').filter(l => l.includes('\u26A0') || /warn/i.test(l)).length;
  const okLines = combined.split('\n').filter(l => l.includes('\u2713') || l.includes('\u2714')).length;
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

// Runs all 5 CLI tools in parallel. Velocity is the 6th tool but is embedded
// (SQLite, always-on) and has no CLI scan mode, so it is excluded here.
export async function runAllChecks(cwd: string): Promise<ToolResult[]> {
  return Promise.all([
    checkStale(cwd),
    checkEnvalid(cwd),
    checkBerth(cwd),
    checkVow(cwd),
    checkAware(),
  ]);
}
