import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/detectors/index.js', () => ({
  detectAllActive: vi.fn(),
  detectAllConfigured: vi.fn(),
  createDefaultRegistry: vi.fn(() => ({})),
}));

vi.mock('../../src/config/loader.js', () => ({ loadConfig: vi.fn(async () => null) }));

import { statusCommand } from '../../src/commands/status.js';
import { detectAllActive } from '../../src/detectors/index.js';
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

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await statusCommand({ json: false, verbose: false, noColor: false });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0][0];
    expect(output).toContain('Summary');
  });
});
