import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Mock everything the MCP server tools reach into, BEFORE importing server.ts.
vi.mock('../../src/detectors/index.js', () => ({
  detectAllActive: vi.fn(async () => ({ ports: [], docker: [], warnings: [] })),
  detectAllConfigured: vi.fn(async () => ({ ports: [], warnings: [] })),
  createDefaultRegistry: vi.fn(() => ({})),
}));
vi.mock('../../src/registry/store.js', () => ({
  loadRegistry: vi.fn(async () => ({ version: 2, projects: {}, reservations: [] })),
  saveRegistry: vi.fn(async () => {}),
  getRegistryDir: vi.fn(() => '/tmp/berth-test-mcp'),
}));
vi.mock('../../src/config/loader.js', () => ({ loadConfig: vi.fn(async () => null) }));
vi.mock('../../src/config/team.js', () => ({
  loadTeamConfig: vi.fn(async () => null),
  teamReservations: vi.fn(() => []),
  detectRangeViolations: vi.fn(() => []),
}));
vi.mock('../../src/history/recorder.js', () => ({
  appendEvent: vi.fn(async () => {}),
  appendEvents: vi.fn(async () => {}),
  readEvents: vi.fn(async () => []),
  diffSnapshots: vi.fn(() => []),
  readLastStatus: vi.fn(async () => undefined),
  writeLastStatus: vi.fn(async () => {}),
  parseSince: vi.fn((s: string) => new Date(s)),
}));
vi.mock('../../src/resolver/actions.js', () => ({
  killPortProcess: vi.fn(async () => ({
    killed: [{ pid: 4242, port: 3000, process: 'node' }],
    failed: [],
    freedPorts: [3000],
  })),
}));

import { createMcpServer } from '../../src/mcp/server.js';

async function connect() {
  const server = createMcpServer();
  const [clientTx, serverTx] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTx), client.connect(clientTx)]);
  return { client, server };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function parsePayload(result: { content?: Array<{ type: string; text: string }> }): any {
  const text = result.content?.[0]?.text ?? '';
  return JSON.parse(text);
}

describe('MCP server integration', () => {
  it('lists all registered tools', async () => {
    const { client, server } = await connect();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(
        [
          'berth.status',
          'berth.check',
          'berth.history',
          'berth.reserve',
          'berth.unreserve',
          'berth.kill',
        ].sort(),
      );
    } finally {
      await server.close();
    }
  });

  it('berth.status returns an envelope with schema, data, hints', async () => {
    const { client, server } = await connect();
    try {
      const result = await client.callTool({ name: 'berth.status', arguments: {} });
      const payload = parsePayload(result);
      expect(payload.schema).toBe('berth/status.v1');
      expect(payload.data).toBeDefined();
      expect(Array.isArray(payload.hints)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('berth.kill without confirm returns a dry-run plan and does NOT kill', async () => {
    const actions = await import('../../src/resolver/actions.js');
    const { client, server } = await connect();
    try {
      const result = await client.callTool({
        name: 'berth.kill',
        arguments: { port: 3000 },
      });
      const payload = parsePayload(result);
      expect(payload.dryRun).toBe(true);
      expect(payload.port).toBe(3000);
      expect(actions.killPortProcess).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it('berth.kill with confirm=true actually calls killPortProcess', async () => {
    const actions = await import('../../src/resolver/actions.js');
    const { client, server } = await connect();
    try {
      const result = await client.callTool({
        name: 'berth.kill',
        arguments: { port: 3000, confirm: true },
      });
      const payload = parsePayload(result);
      expect(payload.killed).toHaveLength(1);
      expect(payload.killed[0].pid).toBe(4242);
      expect(actions.killPortProcess).toHaveBeenCalledWith(3000);
    } finally {
      await server.close();
    }
  });

  it('berth.check returns a check envelope', async () => {
    const { client, server } = await connect();
    try {
      const result = await client.callTool({
        name: 'berth.check',
        arguments: { dir: '/tmp' },
      });
      const payload = parsePayload(result);
      expect(payload.schema).toBe('berth/check.v1');
      expect(payload.data).toBeDefined();
    } finally {
      await server.close();
    }
  });
});
