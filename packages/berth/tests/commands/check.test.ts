import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/detectors/index.js', () => ({
  detectAllActive: vi.fn(),
  detectAllConfigured: vi.fn(),
  createDefaultRegistry: vi.fn(() => ({})),
}));
vi.mock('../../src/config/loader.js', () => ({ loadConfig: vi.fn(async () => null) }));
vi.mock('../../src/registry/store.js', () => ({
  loadRegistry: vi.fn(async () => ({ version: 2, projects: {}, reservations: [] })),
}));

import { checkCommand } from '../../src/commands/check.js';
import { detectAllActive, detectAllConfigured } from '../../src/detectors/index.js';
import type { ActivePort, ConfiguredPort } from '../../src/types.js';

beforeEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('checkCommand', () => {
  it('should report no conflicts when ports are free', async () => {
    vi.mocked(detectAllActive).mockResolvedValue({ ports: [], docker: [], warnings: [] });
    vi.mocked(detectAllConfigured).mockResolvedValue({
      ports: [
        { port: 8080, source: 'dotenv', sourceFile: '/tmp/.env', context: 'PORT=8080', projectDir: '/tmp', projectName: 'test', confidence: 'high' as const },
      ],
      warnings: [],
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await checkCommand('/tmp', { json: true, verbose: false, noColor: false });

    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.conflicts).toHaveLength(0);
    expect(process.exitCode).toBeUndefined();
  });

  it('should set exit code 1 when conflicts found', async () => {
    const mockActive: ActivePort[] = [
      { port: 3000, pid: 100, process: 'node', command: 'node', user: 'user', protocol: 'tcp', address: '0.0.0.0', source: 'lsof' },
    ];
    const mockConfigured: ConfiguredPort[] = [
      { port: 3000, source: 'dotenv', sourceFile: '/proj/.env', context: 'PORT=3000', projectDir: '/proj', projectName: 'my-proj', confidence: 'high' },
    ];

    vi.mocked(detectAllActive).mockResolvedValue({ ports: mockActive, docker: [], warnings: [] });
    vi.mocked(detectAllConfigured).mockResolvedValue({ ports: mockConfigured, warnings: [] });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await checkCommand('/proj', { json: true, verbose: false, noColor: false });

    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.conflicts.length).toBeGreaterThan(0);
    expect(process.exitCode).toBe(1);
  });

  it('should include scanned sources in output', async () => {
    vi.mocked(detectAllActive).mockResolvedValue({ ports: [], docker: [], warnings: [] });
    vi.mocked(detectAllConfigured).mockResolvedValue({
      ports: [
        { port: 3000, source: 'package-json', sourceFile: '/proj/package.json', context: 'scripts.dev', projectDir: '/proj', projectName: 'test', confidence: 'high' as const },
        { port: 5432, source: 'dotenv', sourceFile: '/proj/.env', context: 'DB_PORT=5432', projectDir: '/proj', projectName: 'test', confidence: 'high' as const },
      ],
      warnings: [],
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await checkCommand('/proj', { json: true, verbose: false, noColor: false });

    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output.scannedSources.length).toBe(2);
  });
});
