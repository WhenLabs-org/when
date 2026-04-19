import { describe, it, expect } from 'vitest';
import { wrapCheck, wrapStatus } from '../../src/reporters/mcp.js';
import type { CheckOutput, StatusOutput } from '../../src/types.js';

function emptyStatus(): StatusOutput {
  return {
    active: [],
    docker: [],
    configured: [],
    conflicts: [],
    summary: { activePorts: 0, dockerPorts: 0, configuredPorts: 0, conflictCount: 0 },
  };
}

function emptyCheck(): CheckOutput {
  return {
    project: 'proj',
    directory: '/tmp/proj',
    scannedSources: [],
    conflicts: [],
    resolutions: [],
  };
}

describe('wrapStatus', () => {
  it('tags the envelope with schema = berth/status.v1', () => {
    const env = wrapStatus(emptyStatus());
    expect(env.schema).toBe('berth/status.v1');
    expect(env.data.active).toEqual([]);
  });

  it('adds a summary hint', () => {
    const env = wrapStatus(emptyStatus());
    expect(env.hints[0]).toMatch(/Summary:/);
  });

  it('surfaces a hint for each conflict', () => {
    const status = emptyStatus();
    status.conflicts.push({
      port: 3000,
      claimants: [],
      severity: 'error',
      suggestion: 'Port 3000 is busy.',
    });
    const env = wrapStatus(status);
    expect(env.hints.some((h) => h.includes('Port 3000'))).toBe(true);
  });
});

describe('wrapCheck', () => {
  it('adds a ready-to-start hint when clean', () => {
    const env = wrapCheck(emptyCheck());
    expect(env.hints.some((h) => h.includes('ready to start'))).toBe(true);
  });

  it('formats kill resolutions with the exact command', () => {
    const check = emptyCheck();
    check.resolutions.push({
      type: 'kill',
      description: 'Kill PID 42',
      port: 3000,
      pid: 42,
      automatic: true,
    });
    const env = wrapCheck(check);
    expect(env.hints.some((h) => h === 'Run: kill 42  (port 3000)')).toBe(true);
  });

  it('formats reassign resolutions', () => {
    const check = emptyCheck();
    check.resolutions.push({
      type: 'reassign',
      description: 'Move to 3001',
      port: 3000,
      targetPort: 3001,
      automatic: true,
    });
    const env = wrapCheck(check);
    expect(env.hints.some((h) => h.includes('3000 → 3001'))).toBe(true);
  });
});
