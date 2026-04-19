import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildFlappingReport } from '../../src/commands/history.js';
import type { HistoryEvent } from '../../src/history/events.js';

vi.mock('../../src/history/recorder.js', () => ({
  readEvents: vi.fn(async () => [] as HistoryEvent[]),
  parseSince: vi.fn((s: string) => new Date(s)),
}));

import { historyCommand } from '../../src/commands/history.js';
import { readEvents } from '../../src/history/recorder.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});

describe('historyCommand', () => {
  it('outputs an empty result as JSON when there are no events', async () => {
    vi.mocked(readEvents).mockResolvedValue([]);
    await historyCommand(undefined, { json: true, verbose: false, noColor: false });
    const parsed = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(parsed.events).toEqual([]);
  });

  it('surfaces events via JSON when available', async () => {
    vi.mocked(readEvents).mockResolvedValue([
      { type: 'port-claimed', at: '2024-01-01T00:00:00Z', port: 3000, pid: 1, process: 'node' },
    ]);
    await historyCommand(undefined, { json: true, verbose: false, noColor: false });
    const parsed = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(parsed.events).toHaveLength(1);
  });

  it('rejects a bad port argument', async () => {
    await historyCommand('not-a-port', { json: true, verbose: false, noColor: false });
    expect(process.exitCode).toBe(2);
  });
});

describe('buildFlappingReport', () => {
  it('only includes ports with ≥3 claim/release events', () => {
    const events: HistoryEvent[] = [
      { type: 'port-claimed', at: 't1', port: 3000, pid: 1, process: 'node' },
      { type: 'port-released', at: 't2', port: 3000, pid: 1 },
      { type: 'port-claimed', at: 't3', port: 3000, pid: 2, process: 'node' },
      { type: 'port-released', at: 't4', port: 3000, pid: 2 },
      { type: 'port-claimed', at: 't5', port: 4000, pid: 5, process: 'vite' },
    ];
    const rows = buildFlappingReport(events);
    expect(rows).toHaveLength(1);
    expect(rows[0].port).toBe(3000);
    expect(rows[0].claims).toBe(2);
    expect(rows[0].releases).toBe(2);
  });

  it('picks the most-common process as typical', () => {
    const events: HistoryEvent[] = Array.from({ length: 4 }, (_, i) => ({
      type: 'port-claimed' as const,
      at: 't' + i,
      port: 3000,
      pid: i + 1,
      process: i === 3 ? 'vite' : 'node',
    }));
    const rows = buildFlappingReport(events);
    expect(rows[0].typicalProcess).toBe('node');
  });
});
