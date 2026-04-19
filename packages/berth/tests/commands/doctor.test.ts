import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/platform.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/platform.js')>(
    '../../src/utils/platform.js',
  );
  return {
    ...actual,
    shellExec: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    isDockerAvailable: vi.fn(async () => true),
    getCurrentPlatform: vi.fn(() => 'linux' as const),
  };
});
vi.mock('../../src/registry/store.js', () => ({
  loadRegistry: vi.fn(async () => ({ version: 2, projects: {}, reservations: [] })),
  getRegistryPath: vi.fn(() => '/tmp/berth-doctor/registry.json'),
  getRegistryDir: vi.fn(() => '/tmp/berth-doctor'),
}));
vi.mock('../../src/utils/environment.js', () => ({
  detectEnvironment: vi.fn(async () => ({ kind: 'host' })),
  resetEnvironmentCache: vi.fn(),
}));
vi.mock('../../src/history/recorder.js', () => ({
  historyFileStats: vi.fn(async () => undefined),
}));
vi.mock('../../src/detectors/index.js', () => ({
  detectAllActive: vi.fn(async () => ({ ports: [], docker: [], warnings: [] })),
  detectAllConfigured: vi.fn(async () => ({ ports: [], warnings: [] })),
  createDefaultRegistry: vi.fn(() => ({})),
}));
vi.mock('../../src/config/loader.js', () => ({ loadConfig: vi.fn(async () => null) }));
vi.mock('../../src/config/team.js', () => ({
  loadTeamConfig: vi.fn(async () => null),
  teamReservations: vi.fn(() => []),
  detectRangeViolations: vi.fn(() => []),
  TeamConfigError: class TeamConfigError extends Error {},
}));
vi.mock('../../src/commands/check.js', () => ({
  scanCheck: vi.fn(async () => ({
    output: { project: 'x', directory: '/tmp', scannedSources: [], conflicts: [], resolutions: [] },
    active: [],
    docker: [],
    warnings: [],
  })),
  checkCommand: vi.fn(),
}));

import { doctorCommand } from '../../src/commands/doctor.js';
import { scanCheck } from '../../src/commands/check.js';
import { detectEnvironment } from '../../src/utils/environment.js';
import { isDockerAvailable } from '../../src/utils/platform.js';
import { historyFileStats } from '../../src/history/recorder.js';
import { loadTeamConfig } from '../../src/config/team.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('doctorCommand', () => {
  it('reports all-ok for a clean happy path', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await doctorCommand({ json: true, verbose: false, noColor: false });
    expect(process.exitCode).toBeUndefined();
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.summary.errors).toBe(0);
    expect(parsed.results.some((r: any) => r.name === 'Node.js ≥ 18' && r.status === 'ok')).toBe(
      true,
    );
  });

  it('warns when Docker is not reachable', async () => {
    vi.mocked(isDockerAvailable).mockResolvedValueOnce(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await doctorCommand({ json: true, verbose: false, noColor: false });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    const docker = parsed.results.find((r: any) => r.name === 'Docker');
    expect(docker.status).toBe('warn');
  });

  it('flags conflicts in cwd as an error', async () => {
    vi.mocked(scanCheck).mockResolvedValueOnce({
      output: {
        project: 'x',
        directory: '/tmp',
        scannedSources: [{ file: '.env', type: 'dotenv' as any, portsFound: 1 }],
        conflicts: [
          {
            port: 3000,
            claimants: [],
            severity: 'error' as const,
            suggestion: 'busy',
          },
        ],
        resolutions: [],
      },
      active: [],
      docker: [],
      warnings: [],
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await doctorCommand({ json: true, verbose: false, noColor: false });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    const conflicts = parsed.results.find((r: any) => r.name === 'Conflicts in cwd');
    expect(conflicts.status).toBe('fail');
    expect(process.exitCode).toBe(1);
  });

  it('reports environment advisory for non-host', async () => {
    vi.mocked(detectEnvironment).mockResolvedValueOnce({
      kind: 'wsl2',
      detail: 'Ubuntu-22.04',
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await doctorCommand({ json: true, verbose: false, noColor: false });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    const env = parsed.results.find((r: any) => r.name === 'Environment');
    expect(env.status).toBe('warn');
    expect(env.detail).toContain('Ubuntu');
  });

  it('warns when history log is close to rotation threshold', async () => {
    vi.mocked(historyFileStats).mockResolvedValueOnce({ size: 9 * 1024 * 1024 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await doctorCommand({ json: true, verbose: false, noColor: false });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    const hist = parsed.results.find((r: any) => r.name === 'History log');
    expect(hist.status).toBe('warn');
  });

  it('surfaces team config schema errors', async () => {
    const { TeamConfigError } = await import('../../src/config/team.js');
    vi.mocked(loadTeamConfig).mockRejectedValueOnce(
      new TeamConfigError('assignments[0].port: must be a valid port'),
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await doctorCommand({ json: true, verbose: false, noColor: false });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    const team = parsed.results.find((r: any) => r.name === 'Team config');
    expect(team.status).toBe('fail');
  });
});
