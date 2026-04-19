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

/**
 * Structured contract every adapter produces. The kit normalizes each tool's
 * output into this shape, replacing the bespoke parsing that used to live
 * inline in each `checkX`. Phase 3 will promote this type into @whenlabs/core.
 */
export interface Finding {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ToolReport {
  tool: string;
  ok: boolean;
  findings: Finding[];
  summary: string;
  skipped?: { reason: string };
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

/**
 * Extract the first JSON object from a string. Tools frequently print a
 * progress line (e.g. "✔ Scanned 498 packages") before their JSON payload.
 */
export function extractJson(raw: string): unknown | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
}

function countBySeverity(findings: Finding[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === 'error') errors++;
    else if (f.severity === 'warning') warnings++;
  }
  return { errors, warnings };
}

function reportToResult(
  report: ToolReport,
  label: string,
  exitCode: number,
  opts: { pluralUnit: string; okDetail: (r: ToolReport) => string } = {
    pluralUnit: 'issue',
    okDetail: (r) => r.summary,
  }
): ToolResult {
  if (report.skipped) {
    return {
      name: report.tool,
      label,
      issues: 0,
      warnings: 0,
      status: 'skipped',
      detail: report.skipped.reason,
      exitCode,
    };
  }
  const { errors, warnings } = countBySeverity(report.findings);
  const status: ToolResult['status'] =
    errors > 0 || warnings > 0 ? 'issues' : 'ok';
  const detail =
    status === 'ok'
      ? opts.okDetail(report)
      : `${errors} error(s), ${warnings} warning(s)`;
  return {
    name: report.tool,
    label,
    issues: errors,
    warnings,
    status,
    detail,
    exitCode,
  };
}

// --- Per-tool adapters: raw stdout/stderr → normalized ToolReport ---

interface SummaryShape {
  summary?: { errors?: number; warnings?: number };
  issues?: Array<{ severity: string; message?: string }>;
}

function adaptSummaryShape(tool: string, json: SummaryShape): ToolReport {
  const errorCount =
    json.summary?.errors ??
    json.issues?.filter((i) => i.severity === 'error').length ??
    0;
  const warningCount =
    json.summary?.warnings ??
    json.issues?.filter((i) => i.severity === 'warning').length ??
    0;
  const findings: Finding[] = [
    ...Array(errorCount).fill(0).map<Finding>(() => ({ severity: 'error', message: `${tool} error` })),
    ...Array(warningCount).fill(0).map<Finding>(() => ({ severity: 'warning', message: `${tool} warning` })),
  ];
  return {
    tool,
    ok: errorCount === 0 && warningCount === 0,
    findings,
    summary:
      errorCount + warningCount === 0
        ? `${tool}: clean`
        : `${tool}: ${errorCount} error(s), ${warningCount} warning(s)`,
  };
}

export function adaptStale(raw: { stdout: string; stderr: string }): ToolReport {
  const json = extractJson(raw.stdout) as SummaryShape | null;
  if (!json) {
    return {
      tool: 'stale',
      ok: false,
      findings: [{ severity: 'error', message: 'Failed to parse stale output' }],
      summary: 'parse error',
    };
  }
  return adaptSummaryShape('stale', json);
}

export function adaptEnvalid(raw: {
  stdout: string;
  stderr: string;
  exitCode: number;
}): ToolReport {
  if (
    raw.exitCode === 2 ||
    raw.stdout.includes('Schema file not found') ||
    raw.stdout.includes('not found')
  ) {
    return {
      tool: 'envalid',
      ok: true,
      findings: [],
      summary: 'no schema',
      skipped: { reason: 'No .env.schema found — run `envalid init`' },
    };
  }
  const json = extractJson(raw.stdout) as SummaryShape | null;
  if (!json) {
    return {
      tool: 'envalid',
      ok: false,
      findings: [{ severity: 'error', message: 'Failed to parse envalid output' }],
      summary: 'parse error',
    };
  }
  return adaptSummaryShape('envalid', json);
}

export function adaptBerth(raw: { stdout: string; stderr: string }): ToolReport {
  const json = extractJson(raw.stdout) as { conflicts?: unknown[] } | null;
  if (!json) {
    return {
      tool: 'berth',
      ok: false,
      findings: [{ severity: 'error', message: 'Failed to parse berth output' }],
      summary: 'parse error',
    };
  }
  const conflicts = json.conflicts?.length ?? 0;
  const findings: Finding[] = Array(conflicts)
    .fill(0)
    .map(() => ({ severity: 'error', message: 'port conflict' }));
  return {
    tool: 'berth',
    ok: conflicts === 0,
    findings,
    summary: conflicts === 0 ? 'No port conflicts' : `${conflicts} port conflict(s)`,
  };
}

export function adaptVow(raw: { stdout: string; stderr: string }): ToolReport {
  const json = extractJson(raw.stdout) as
    | {
        packages?: Array<{ license?: { category?: string } }>;
        summary?: { violations?: number; warnings?: number };
      }
    | null;
  if (!json) {
    return {
      tool: 'vow',
      ok: false,
      findings: [{ severity: 'error', message: 'Failed to parse vow output' }],
      summary: 'parse error',
    };
  }
  const copyleft = json.packages?.filter((p) => p.license?.category === 'copyleft').length ?? 0;
  const unknown = json.packages?.filter((p) => !p.license?.category || p.license.category === 'unknown').length ?? 0;
  const total = json.packages?.length ?? 0;
  const violations = json.summary?.violations ?? 0;
  const warnCount = json.summary?.warnings ?? copyleft + unknown;
  const findings: Finding[] = [
    ...Array(violations).fill(0).map<Finding>(() => ({ severity: 'error', message: 'license violation' })),
    ...Array(warnCount).fill(0).map<Finding>(() => ({ severity: 'warning', message: 'license warning' })),
  ];
  const summary =
    total === 0
      ? 'No packages found'
      : violations + warnCount === 0
        ? `${total} packages, all permissive`
        : `${total} packages — ${copyleft} copyleft, ${unknown} unknown`;
  return {
    tool: 'vow',
    ok: violations === 0 && warnCount === 0,
    findings,
    summary,
  };
}

export function adaptAware(raw: {
  stdout: string;
  stderr: string;
  exitCode: number;
}): ToolReport {
  const combined = (raw.stdout + raw.stderr).trim();
  if (raw.exitCode !== 0) {
    if (combined.includes('.aware.json not found')) {
      return {
        tool: 'aware',
        ok: true,
        findings: [],
        summary: 'no .aware.json',
        skipped: { reason: 'No .aware.json found — run `aware init`' },
      };
    }
    return {
      tool: 'aware',
      ok: false,
      findings: [{ severity: 'error', message: 'aware doctor failed' }],
      summary: 'aware doctor error',
    };
  }
  const lines = combined.split('\n');
  const warnings = lines.filter((l) => l.includes('\u26A0') || /warn/i.test(l)).length;
  const passed = lines.filter((l) => l.includes('\u2713') || l.includes('\u2714')).length;
  const findings: Finding[] = Array(warnings)
    .fill(0)
    .map(() => ({ severity: 'warning', message: 'aware warning' }));
  return {
    tool: 'aware',
    ok: warnings === 0,
    findings,
    summary: warnings > 0 ? `${warnings} warning(s)` : `${passed} check(s) passed`,
  };
}

// --- Public wrappers preserved for existing callers (watch, doctor, init) ---

export async function checkStale(cwd: string): Promise<ToolResult> {
  const bin = findBin('stale');
  const raw = await runTool(bin, ['scan', '--format', 'json', '--path', cwd]);
  const report = adaptStale(raw);
  return reportToResult(report, 'stale scan', raw.exitCode, {
    pluralUnit: 'issue',
    okDetail: () => 'No documentation drift detected',
  });
}

export async function checkEnvalid(cwd: string): Promise<ToolResult> {
  void cwd;
  const bin = findBin('envalid');
  const raw = await runTool(bin, ['validate', '--format', 'json']);
  const report = adaptEnvalid(raw);
  return reportToResult(report, 'envalid validate', raw.exitCode, {
    pluralUnit: 'issue',
    okDetail: () => '.env is valid',
  });
}

export async function checkBerth(cwd: string): Promise<ToolResult> {
  const bin = findBin('berth');
  const raw = await runTool(bin, ['check', cwd, '--json']);
  const report = adaptBerth(raw);
  return reportToResult(report, 'berth check', raw.exitCode, {
    pluralUnit: 'conflict',
    okDetail: () => 'No port conflicts',
  });
}

export async function checkVow(cwd: string): Promise<ToolResult> {
  const bin = findBin('vow');
  const raw = await runTool(bin, ['scan', '--format', 'json', '--path', cwd]);
  const report = adaptVow(raw);
  return reportToResult(report, 'vow scan', raw.exitCode, {
    pluralUnit: 'issue',
    okDetail: (r) => r.summary,
  });
}

export async function checkAware(): Promise<ToolResult> {
  const bin = findBin('aware');
  const raw = await runTool(bin, ['doctor']);
  const report = adaptAware(raw);
  return reportToResult(report, 'aware doctor', raw.exitCode, {
    pluralUnit: 'issue',
    okDetail: (r) => r.summary,
  });
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
