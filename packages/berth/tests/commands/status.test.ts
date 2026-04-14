import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the detectors and registry before importing the command
vi.mock('../../src/detectors/index.js', () => ({
  detectAllActive: vi.fn(),
  detectAllConfigured: vi.fn(),
}));

vi.mock('../../src/registry/store.js', () => ({
  loadRegistry: vi.fn(),
}));

import { statusCommand } from '../../src/commands/status.js';
import { detectAllActive } from '../../src/detectors/index.js';
import { loadRegistry } from '../../src/registry/store.js';
import type { ActivePort, DockerPort } from '../../src/types.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('statusCommand', () => {
  it('should output JSON with --json flag', async () => {
    const mockActive: ActivePort[] = [
      { port: 3000, pid: 100, process: 'node', command: 'node', user: 'user', protocol: 'tcp', address: '0.0.0.0', source: 'lsof' },
    ];
    const mockDocker: DockerPort[] = [];

    vi.mocked(detectAllActive).mockResolvedValue({ ports: mockActive, docker: mockDocker, warnings: [] });
    vi.mocked(loadRegistry).mockResolvedValue({ version: 1, projects: {} });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await statusCommand({ json: true, verbose: false, noColor: false });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.active).toHaveLength(1);
    expect(output.active[0].port).toBe(3000);
    expect(output.summary.activePorts).toBe(1);
    expect(output.summary.conflictCount).toBe(0);
  });

  it('should show terminal output without --json', async () => {
    vi.mocked(detectAllActive).mockResolvedValue({ ports: [], docker: [], warnings: [] });
    vi.mocked(loadRegistry).mockResolvedValue({ version: 1, projects: {} });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await statusCommand({ json: false, verbose: false, noColor: false });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('Summary');
  });

  it('should link active ports to registered projects', async () => {
    const mockActive: ActivePort[] = [
      { port: 3000, pid: 100, process: 'node', command: 'node', user: 'user', protocol: 'tcp', address: '0.0.0.0', source: 'lsof' },
    ];

    vi.mocked(detectAllActive).mockResolvedValue({ ports: mockActive, docker: [], warnings: [] });
    vi.mocked(loadRegistry).mockResolvedValue({
      version: 1,
      projects: {
        'my-app': {
          name: 'my-app',
          directory: '/tmp/my-app',
          ports: [{ port: 3000, source: 'dotenv', sourceFile: '.env', description: 'PORT=3000' }],
          registeredAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await statusCommand({ json: true, verbose: false, noColor: false });

    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.active[0].project).toBe('my-app');
  });
});
