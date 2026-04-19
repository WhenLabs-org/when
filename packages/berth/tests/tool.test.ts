import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/detectors/index.js', () => ({
  detectAllActive: vi.fn(),
  detectAllConfigured: vi.fn(),
  createDefaultRegistry: vi.fn(() => ({})),
}));
vi.mock('../src/config/loader.js', () => ({ loadConfig: vi.fn(async () => null) }));
vi.mock('../src/registry/store.js', () => ({
  loadRegistry: vi.fn(async () => ({ version: 2, projects: {}, reservations: [] })),
}));
vi.mock('../src/history/recorder.js', () => ({
  appendEvents: vi.fn(async () => {}),
  diffSnapshots: vi.fn(() => []),
  readLastStatus: vi.fn(async () => undefined),
  writeLastStatus: vi.fn(async () => {}),
}));

import { createTool } from '../src/tool.js';
import { detectAllActive, detectAllConfigured } from '../src/detectors/index.js';
import type { ActivePort, ConfiguredPort } from '../src/types.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createTool', () => {
  it('returns a Tool with name, description, and scan', () => {
    const tool = createTool();
    expect(tool.name).toBe('berth');
    expect(typeof tool.description).toBe('string');
    expect(typeof tool.scan).toBe('function');
  });

  it('produces a ScanResult with ok=true when no conflicts', async () => {
    vi.mocked(detectAllActive).mockResolvedValue({ ports: [], docker: [], warnings: [] });
    vi.mocked(detectAllConfigured).mockResolvedValue({
      ports: [
        {
          port: 8080,
          source: 'dotenv',
          sourceFile: '/tmp/.env',
          context: 'PORT=8080',
          projectDir: '/tmp',
          projectName: 'test',
          confidence: 'high',
        },
      ],
      warnings: [],
    });

    const result = await createTool().scan({ cwd: '/tmp' });

    expect(result.schemaVersion).toBe(1);
    expect(result.tool).toBe('berth');
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.summary.total).toBe(0);
    expect(result.summary.errors).toBe(0);
    expect(result.project.name).toBe('tmp');
    expect(result.project.cwd).toBe('/tmp');
    expect(result.raw).toBeDefined();
  });

  it('emits a Finding per conflict with ok=false', async () => {
    const active: ActivePort[] = [
      {
        port: 3000,
        pid: 100,
        process: 'node',
        command: 'node',
        user: 'user',
        protocol: 'tcp',
        address: '0.0.0.0',
        source: 'lsof',
      },
    ];
    const configured: ConfiguredPort[] = [
      {
        port: 3000,
        source: 'dotenv',
        sourceFile: '/proj/.env',
        sourceLine: 5,
        context: 'PORT=3000',
        projectDir: '/proj',
        projectName: 'my-proj',
        confidence: 'high',
      },
    ];

    vi.mocked(detectAllActive).mockResolvedValue({ ports: active, docker: [], warnings: [] });
    vi.mocked(detectAllConfigured).mockResolvedValue({ ports: configured, warnings: [] });

    const result = await createTool().scan({ cwd: '/proj' });

    expect(result.ok).toBe(false);
    expect(result.findings).toHaveLength(1);
    const [finding] = result.findings;
    expect(finding.tool).toBe('berth');
    expect(finding.ruleId).toBe('port-conflict');
    expect(finding.severity).toBe('error');
    expect(finding.message).toContain('3000');
    expect(finding.location?.file).toBe('/proj/.env');
    expect(finding.location?.line).toBe(5);
    expect(finding.data).toMatchObject({ port: 3000 });
    expect(result.summary.errors).toBe(1);
    expect(result.summary.extra?.activePorts).toBe(1);
  });
});
