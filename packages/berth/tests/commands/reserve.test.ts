import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { registry: { version: 2, projects: {}, reservations: [] as any[] } };

vi.mock('../../src/registry/store.js', () => ({
  loadRegistry: vi.fn(async () => state.registry),
  saveRegistry: vi.fn(async (next: any) => {
    state.registry = next;
  }),
  getRegistryDir: vi.fn(() => '/tmp/berth-test-registry'),
}));
vi.mock('../../src/history/recorder.js', () => ({
  appendEvent: vi.fn(async () => {}),
  appendEvents: vi.fn(async () => {}),
}));

import { reserveCommand } from '../../src/commands/reserve.js';
import { unreserveCommand } from '../../src/commands/unreserve.js';
import { reservationsCommand } from '../../src/commands/reservations.js';

beforeEach(() => {
  state.registry = { version: 2, projects: {}, reservations: [] };
  process.exitCode = undefined;
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reserve / unreserve / reservations lifecycle', () => {
  it('creates a reservation and lists it', async () => {
    await reserveCommand('3000', {
      json: true,
      verbose: false,
      noColor: false,
      for: 'my-app',
      reason: 'dev server',
    });
    expect(state.registry.reservations).toHaveLength(1);
    expect(state.registry.reservations[0].project).toBe('my-app');

    (console.log as any).mockClear();
    await reservationsCommand({ json: true, verbose: false, noColor: false });
    const out = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(out.reservations[0].port).toBe(3000);
  });

  it('rejects duplicate reservation without --force', async () => {
    await reserveCommand('3000', { json: true, verbose: false, noColor: false, for: 'a' });
    (console.log as any).mockClear();
    await reserveCommand('3000', { json: true, verbose: false, noColor: false, for: 'b' });
    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(parsed.error).toBe('already-reserved');
  });

  it('overrides existing reservation with --force', async () => {
    await reserveCommand('3000', { json: true, verbose: false, noColor: false, for: 'a' });
    process.exitCode = undefined;
    await reserveCommand('3000', {
      json: true,
      verbose: false,
      noColor: false,
      for: 'b',
      force: true,
    });
    expect(state.registry.reservations[0].project).toBe('b');
    expect(process.exitCode).toBeUndefined();
  });

  it('unreserves a port', async () => {
    await reserveCommand('3000', { json: true, verbose: false, noColor: false, for: 'a' });
    await unreserveCommand('3000', { json: true, verbose: false, noColor: false });
    expect(state.registry.reservations).toHaveLength(0);
  });

  it('rejects an invalid port', async () => {
    await reserveCommand('not-a-port', { json: true, verbose: false, noColor: false, for: 'a' });
    expect(process.exitCode).toBe(2);
  });

  it('honors --expires TTL', async () => {
    await reserveCommand('3000', {
      json: true,
      verbose: false,
      noColor: false,
      for: 'a',
      expires: '1h',
    });
    expect(state.registry.reservations[0].expiresAt).toBeDefined();
  });
});
