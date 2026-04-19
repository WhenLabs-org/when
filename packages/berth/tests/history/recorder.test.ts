import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  appendEvent,
  appendEvents,
  diffSnapshots,
  parseSince,
  readEvents,
} from '../../src/history/recorder.js';
import type { HistoryEvent } from '../../src/history/events.js';
import type { LastStatusFile } from '../../src/history/recorder.js';

let tmpDir: string;
let histPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-hist-'));
  histPath = path.join(tmpDir, 'history.jsonl');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function ev(overrides: Partial<HistoryEvent>): HistoryEvent {
  return {
    type: 'port-claimed',
    at: '2024-01-01T00:00:00.000Z',
    port: 3000,
    pid: 100,
    process: 'node',
    ...overrides,
  } as HistoryEvent;
}

describe('append + read round-trip', () => {
  it('writes a single event and reads it back', async () => {
    await appendEvent(ev({}), histPath);
    const events = await readEvents({}, histPath);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('port-claimed');
  });

  it('appends multiple events and preserves order', async () => {
    await appendEvents(
      [ev({ port: 3000 }), ev({ port: 3001 }), ev({ port: 3002 })],
      histPath,
    );
    const events = await readEvents({}, histPath);
    expect(events.map((e: any) => e.port)).toEqual([3000, 3001, 3002]);
  });

  it('filters by port', async () => {
    await appendEvents(
      [ev({ port: 3000 }), ev({ port: 4000 }), ev({ port: 3000 })],
      histPath,
    );
    const events = await readEvents({ port: 3000 }, histPath);
    expect(events).toHaveLength(2);
  });

  it('filters by type', async () => {
    await appendEvents(
      [
        ev({}),
        ev({ type: 'port-released', pid: 100 }),
        ev({ type: 'conflict-observed', claimants: 2, severity: 'error' } as any),
      ],
      histPath,
    );
    const releases = await readEvents({ type: 'port-released' }, histPath);
    expect(releases).toHaveLength(1);
  });

  it('filters by since', async () => {
    await appendEvents(
      [
        ev({ at: '2024-01-01T00:00:00.000Z', port: 1 }),
        ev({ at: '2024-02-01T00:00:00.000Z', port: 2 }),
      ],
      histPath,
    );
    const events = await readEvents(
      { since: new Date('2024-01-15T00:00:00.000Z') },
      histPath,
    );
    expect(events.map((e: any) => e.port)).toEqual([2]);
  });

  it('enforces limit', async () => {
    await appendEvents([ev({}), ev({}), ev({}), ev({}), ev({})], histPath);
    const events = await readEvents({ limit: 2 }, histPath);
    expect(events).toHaveLength(2);
  });

  it('returns [] when file does not exist', async () => {
    expect(await readEvents({}, path.join(tmpDir, 'missing.jsonl'))).toEqual([]);
  });

  it('skips malformed JSON lines without crashing', async () => {
    await fs.writeFile(histPath, 'not-json\n' + JSON.stringify(ev({})) + '\n');
    const events = await readEvents({}, histPath);
    expect(events).toHaveLength(1);
  });
});

describe('diffSnapshots', () => {
  it('emits port-claimed for a brand-new port', () => {
    const next: LastStatusFile = {
      timestamp: '2024-01-01T00:00:00Z',
      ports: { '3000': { pid: 100, process: 'node' } },
    };
    const events = diffSnapshots(undefined, next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('port-claimed');
  });

  it('emits port-released when a port disappears', () => {
    const prev: LastStatusFile = {
      timestamp: '2024-01-01T00:00:00Z',
      ports: { '3000': { pid: 100, process: 'node' } },
    };
    const next: LastStatusFile = {
      timestamp: '2024-01-02T00:00:00Z',
      ports: {},
    };
    const events = diffSnapshots(prev, next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('port-released');
  });

  it('emits release+claim when the pid on a port changes', () => {
    const prev: LastStatusFile = {
      timestamp: '2024-01-01T00:00:00Z',
      ports: { '3000': { pid: 100, process: 'node' } },
    };
    const next: LastStatusFile = {
      timestamp: '2024-01-02T00:00:00Z',
      ports: { '3000': { pid: 200, process: 'node' } },
    };
    const events = diffSnapshots(prev, next);
    const types = events.map((e) => e.type).sort();
    expect(types).toEqual(['port-claimed', 'port-released']);
  });

  it('emits nothing when the snapshot is unchanged', () => {
    const snap: LastStatusFile = {
      timestamp: '2024-01-01T00:00:00Z',
      ports: { '3000': { pid: 100, process: 'node' } },
    };
    expect(diffSnapshots(snap, snap)).toEqual([]);
  });
});

describe('parseSince', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  it('parses relative durations', () => {
    expect(parseSince('1h', now).toISOString()).toBe('2024-01-15T11:00:00.000Z');
    expect(parseSince('7d', now).toISOString()).toBe('2024-01-08T12:00:00.000Z');
  });

  it('accepts ISO dates', () => {
    expect(parseSince('2024-01-01T00:00:00Z', now).toISOString()).toBe(
      '2024-01-01T00:00:00.000Z',
    );
  });

  it('throws on bogus input', () => {
    expect(() => parseSince('yesterday', now)).toThrow(/invalid --since/);
  });
});
