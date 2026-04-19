import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/detectors/index.js', () => ({
  detectAllActive: vi.fn(),
}));

vi.mock('../../src/registry/store.js', () => ({
  loadRegistry: vi.fn(),
}));

import { listCommand } from '../../src/commands/list.js';
import { detectAllActive } from '../../src/detectors/index.js';
import { loadRegistry } from '../../src/registry/store.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('listCommand', () => {
  it('should output JSON with project statuses', async () => {
    vi.mocked(detectAllActive).mockResolvedValue({
      ports: [
        { port: 3000, pid: 100, process: 'node', command: 'node', user: 'user', protocol: 'tcp', address: '0.0.0.0', source: 'lsof' },
      ],
      docker: [],
      warnings: [],
    });

    vi.mocked(loadRegistry).mockResolvedValue({
      version: 2,
      projects: {
        'my-app': {
          name: 'my-app',
          directory: '/tmp/my-app',
          ports: [{ port: 3000, source: 'dotenv', sourceFile: '.env', description: 'PORT=3000' }],
          registeredAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        'other-app': {
          name: 'other-app',
          directory: '/tmp/other-app',
          ports: [{ port: 8080, source: 'dotenv', sourceFile: '.env', description: 'PORT=8080' }],
          registeredAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      },
      reservations: [],
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await listCommand({ json: true, verbose: false, noColor: false });

    const output = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(output).toHaveLength(2);

    const myApp = output.find((p: any) => p.name === 'my-app');
    expect(myApp.status).toBe('running');

    const otherApp = output.find((p: any) => p.name === 'other-app');
    expect(otherApp.status).toBe('stopped');
  });

  it('should show empty message when no projects registered', async () => {
    vi.mocked(detectAllActive).mockResolvedValue({ ports: [], docker: [], warnings: [] });
    vi.mocked(loadRegistry).mockResolvedValue({ version: 2, projects: {}, reservations: [] });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await listCommand({ json: false, verbose: false, noColor: false });

    expect(consoleSpy.mock.calls[0][0]).toContain('No projects registered');
  });
});
