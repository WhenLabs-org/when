import { describe, it, expect } from 'vitest';
import { buildWhenlabsSummary } from '../mcp/summary.js';
import { formatBrief } from '../commands/doctor.js';
import type { ScanRollup } from '../utils/scan-runner.js';

function rollup(over: Partial<ScanRollup> & { name: string }): ScanRollup {
  return {
    name: over.name,
    label: over.label ?? `${over.name} scan`,
    issues: over.issues ?? 0,
    warnings: over.warnings ?? 0,
    status: over.status ?? 'ok',
    detail: over.detail ?? 'all good',
    exitCode: over.exitCode ?? (over.status === 'issues' || over.status === 'error' ? 1 : 0),
  };
}

describe('buildWhenlabsSummary', () => {
  it('rolls up all five scanners into a keyed tools record', () => {
    const results = [
      rollup({ name: 'stale', status: 'ok', detail: 'No documentation drift detected' }),
      rollup({ name: 'envalid', status: 'ok', detail: '.env is valid' }),
      rollup({ name: 'berth', status: 'ok', detail: 'No port conflicts' }),
      rollup({ name: 'vow', status: 'ok', detail: '12 packages, all permissive' }),
      rollup({ name: 'aware', status: 'ok', detail: '8 check(s) passed' }),
    ];
    const s = buildWhenlabsSummary(results);
    expect(Object.keys(s.tools).sort()).toEqual(['aware', 'berth', 'envalid', 'stale', 'vow']);
    expect(s.tools.vow).toEqual({
      issues: 0,
      warnings: 0,
      status: 'ok',
      detail: '12 packages, all permissive',
    });
  });

  it("reports worst_severity 'clean' when every scanner is ok or skipped", () => {
    const results = [
      rollup({ name: 'stale', status: 'ok' }),
      rollup({ name: 'envalid', status: 'skipped', detail: 'No .env.schema found' }),
    ];
    const s = buildWhenlabsSummary(results);
    expect(s.worst_severity).toBe('clean');
    expect(s.total_issues).toBe(0);
    expect(s.total_warnings).toBe(0);
  });

  it("reports worst_severity 'warning' when only warnings exist", () => {
    const results = [
      rollup({ name: 'stale', status: 'ok' }),
      // "issues" status is used when errors OR warnings are present; a
      // warnings-only scan still reports status=issues, so a pure-warning
      // rollup is vanishingly rare in practice — we still guard the case.
      rollup({ name: 'vow', status: 'ok', warnings: 2 }),
    ];
    const s = buildWhenlabsSummary(results);
    expect(s.worst_severity).toBe('warning');
    expect(s.total_warnings).toBe(2);
  });

  it("reports worst_severity 'error' when any scanner has issues", () => {
    const results = [
      rollup({ name: 'stale', status: 'issues', issues: 3, detail: '3 error(s), 0 warning(s)' }),
      rollup({ name: 'envalid', status: 'ok' }),
    ];
    const s = buildWhenlabsSummary(results);
    expect(s.worst_severity).toBe('error');
    expect(s.total_issues).toBe(3);
  });

  it("reports worst_severity 'error' when a scanner itself errored out", () => {
    const results = [
      rollup({ name: 'stale', status: 'ok' }),
      rollup({ name: 'vow', status: 'error', issues: 1, detail: 'Registry fetch failed' }),
    ];
    const s = buildWhenlabsSummary(results);
    expect(s.worst_severity).toBe('error');
  });

  it('sums issues and warnings across all tools', () => {
    const results = [
      rollup({ name: 'stale', status: 'issues', issues: 2, warnings: 1 }),
      rollup({ name: 'vow', status: 'issues', issues: 3, warnings: 4 }),
      rollup({ name: 'envalid', status: 'ok' }),
    ];
    const s = buildWhenlabsSummary(results);
    expect(s.total_issues).toBe(5);
    expect(s.total_warnings).toBe(5);
  });
});

describe('formatBrief', () => {
  it('returns an empty string when every scanner is ok or skipped', () => {
    const out = formatBrief([
      rollup({ name: 'stale', status: 'ok' }),
      rollup({ name: 'envalid', status: 'skipped', detail: 'No .env.schema found' }),
      rollup({ name: 'berth', status: 'ok' }),
    ]);
    expect(out).toBe('');
  });

  it('emits one line per non-clean tool in scan-runner order', () => {
    const out = formatBrief([
      rollup({ name: 'stale', status: 'issues', detail: '2 error(s), 0 warning(s)' }),
      rollup({ name: 'envalid', status: 'ok' }),
      rollup({ name: 'berth', status: 'error', detail: 'Docker socket unreachable' }),
    ]);
    expect(out.split('\n')).toEqual([
      'stale: 2 error(s), 0 warning(s)',
      'berth: Docker socket unreachable',
    ]);
  });

  it('omits skipped scanners even when they have a non-ok detail', () => {
    const out = formatBrief([
      rollup({ name: 'envalid', status: 'skipped', detail: 'No .env.schema found' }),
      rollup({ name: 'stale', status: 'issues', detail: '1 error(s), 0 warning(s)' }),
    ]);
    expect(out).toBe('stale: 1 error(s), 0 warning(s)');
  });
});
