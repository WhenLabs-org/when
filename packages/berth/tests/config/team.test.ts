import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  detectRangeViolations,
  loadTeamConfig,
  TeamConfigError,
  teamReservations,
  validateTeamConfig,
} from '../../src/config/team.js';
import type { ConfiguredPort } from '../../src/types.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-team-'));
  // Pretend this is a repo root so the upward walk stops here.
  await fs.mkdir(path.join(tmpDir, '.git'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function cfoncfigured(port: number, projectName: string): ConfiguredPort {
  return {
    port,
    source: 'package-json',
    sourceFile: `/tmp/${projectName}/package.json`,
    context: 'scripts.dev',
    projectDir: `/tmp/${projectName}`,
    projectName,
    confidence: 'high',
  };
}

describe('validateTeamConfig', () => {
  it('accepts a minimal valid config', () => {
    const cfg = validateTeamConfig({
      version: 1,
      assignments: [{ port: 3000, project: 'web' }],
    });
    expect(cfg.assignments).toHaveLength(1);
  });

  it('rejects duplicate port assignments', () => {
    expect(() =>
      validateTeamConfig({
        version: 1,
        assignments: [
          { port: 3000, project: 'a' },
          { port: 3000, project: 'b' },
        ],
      }),
    ).toThrow(/duplicate assignment/);
  });

  it('rejects invalid version', () => {
    expect(() => validateTeamConfig({ version: 2, assignments: [] })).toThrow(/version/);
  });

  it('rejects invalid port', () => {
    expect(() =>
      validateTeamConfig({ version: 1, assignments: [{ port: 0, project: 'x' }] }),
    ).toThrow(/port/);
  });

  it('validates reservedRanges bounds', () => {
    expect(() =>
      validateTeamConfig({
        version: 1,
        assignments: [],
        reservedRanges: [{ from: 5000, to: 4000, purpose: 'oops' }],
      }),
    ).toThrow(/from must be <= to/);
  });

  it('validates policies enums', () => {
    expect(() =>
      validateTeamConfig({
        version: 1,
        assignments: [],
        policies: { onConflict: 'shrug' },
      }),
    ).toThrow(/onConflict/);
  });
});

describe('loadTeamConfig', () => {
  it('returns null when .berth/team.json does not exist', async () => {
    const loaded = await loadTeamConfig(tmpDir);
    expect(loaded).toBeNull();
  });

  it('loads and validates a well-formed team.json', async () => {
    await fs.mkdir(path.join(tmpDir, '.berth'));
    await fs.writeFile(
      path.join(tmpDir, '.berth', 'team.json'),
      JSON.stringify({
        version: 1,
        assignments: [{ port: 3000, project: 'web', role: 'frontend' }],
        reservedRanges: [{ from: 5000, to: 5010, purpose: 'database' }],
        forbidden: [{ port: 5000, reason: 'company VPN' }],
      }),
    );
    const loaded = await loadTeamConfig(tmpDir);
    expect(loaded?.config.assignments[0].project).toBe('web');
    expect(loaded?.config.reservedRanges?.[0].purpose).toBe('database');
    expect(loaded?.config.forbidden?.[0].reason).toBe('company VPN');
  });

  it('walks upward to find a team config, stopping at .git', async () => {
    await fs.mkdir(path.join(tmpDir, '.berth'));
    await fs.writeFile(
      path.join(tmpDir, '.berth', 'team.json'),
      JSON.stringify({ version: 1, assignments: [{ port: 3000, project: 'web' }] }),
    );
    const nested = path.join(tmpDir, 'apps', 'deep');
    await fs.mkdir(nested, { recursive: true });
    const loaded = await loadTeamConfig(nested);
    expect(loaded?.config.assignments[0].port).toBe(3000);
  });

  it('throws TeamConfigError on malformed JSON', async () => {
    await fs.mkdir(path.join(tmpDir, '.berth'));
    await fs.writeFile(path.join(tmpDir, '.berth', 'team.json'), 'not-json{{');
    await expect(loadTeamConfig(tmpDir)).rejects.toThrow(TeamConfigError);
  });
});

describe('teamReservations', () => {
  it('emits a reservation per assignment and per forbidden port', () => {
    const res = teamReservations({
      version: 1,
      assignments: [{ port: 3000, project: 'web' }],
      forbidden: [{ port: 5000, reason: 'VPN' }],
    });
    expect(res.map((r) => r.port).sort()).toEqual([3000, 5000]);
    expect(res.every((r) => r.source === 'team')).toBe(true);
    const forbidden = res.find((r) => r.port === 5000);
    expect(forbidden?.project).toBe('_team_forbidden_');
  });

  it('does NOT materialise ranges (ranges are handled via detectRangeViolations)', () => {
    const res = teamReservations({
      version: 1,
      assignments: [],
      reservedRanges: [{ from: 5000, to: 5100, purpose: 'db' }],
    });
    expect(res).toEqual([]);
  });
});

describe('detectRangeViolations', () => {
  it('warns on a configured port inside a reserved range', () => {
    const conflicts = detectRangeViolations(
      [cfoncfigured(5050, 'random-project')],
      [{ from: 5000, to: 5100, purpose: 'database pool' }],
      [],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('warning');
    expect(conflicts[0].suggestion).toContain('5000–5100');
  });

  it('does not warn when the port matches an explicit assignment for the same project', () => {
    const conflicts = detectRangeViolations(
      [cfoncfigured(5050, 'database')],
      [{ from: 5000, to: 5100, purpose: 'database pool' }],
      [{ port: 5050, project: 'database' }],
    );
    expect(conflicts).toHaveLength(0);
  });

  it('warns when the assignment project differs from the configured project', () => {
    const conflicts = detectRangeViolations(
      [cfoncfigured(5050, 'imposter')],
      [{ from: 5000, to: 5100, purpose: 'database' }],
      [{ port: 5050, project: 'database' }],
    );
    expect(conflicts).toHaveLength(1);
  });
});
