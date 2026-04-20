import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../utils/find-bin.js', () => ({
  findBin: vi.fn((name: string) => name),
  buildSpawn: vi.fn((name: string) => ({ cmd: name, args: [] })),
}));

import { spawn } from 'node:child_process';
import { checkTriggers, CACHE_DIR } from '../mcp/run-cli.js';

const mockSpawn = vi.mocked(spawn);

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'triggers-test-'));
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function fakeChild(stdout: string, exitCode: number) {
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    child.emit('close', exitCode);
  });
  return child;
}

describe('checkTriggers — SuggestionRule matcher', () => {
  it('emits no hints when tool name has no matching rule', async () => {
    const extras = await checkTriggers(
      'some_unknown_tool',
      { stdout: 'any output', stderr: '', code: 0 },
      tmpDir,
    );
    expect(extras).toEqual([]);
  });

  it('vow_scan with unknown license emits unknown-license hint', async () => {
    const extras = await checkTriggers(
      'vow_scan',
      { stdout: '3 packages have unknown licenses', stderr: '', code: 0 },
      tmpDir,
    );
    expect(extras.some((e) => e.includes('Unknown licenses detected'))).toBe(true);
  });

  it('vow_scan on first run additionally emits aware_sync tip', async () => {
    const extras = await checkTriggers(
      'vow_scan',
      { stdout: 'one unknown detected', stderr: '', code: 0 },
      tmpDir,
    );
    // First-scan rule should also fire (no cache for this tmpDir)
    expect(extras.some((e) => e.includes('aware_sync'))).toBe(true);
  });

  it('berth_check with conflicts and .aware.json emits project name hint', async () => {
    writeFileSync(join(tmpDir, '.aware.json'), JSON.stringify({ name: 'my-proj' }));
    const extras = await checkTriggers(
      'berth_check',
      { stdout: 'port 3000 is in use', stderr: '', code: 1 },
      tmpDir,
    );
    expect(extras.some((e) => e.includes('my-proj'))).toBe(true);
  });

  it('berth_check without conflicts emits no hints', async () => {
    const extras = await checkTriggers(
      'berth_check',
      { stdout: 'all clear', stderr: '', code: 0 },
      tmpDir,
    );
    expect(extras).toEqual([]);
  });

  it('envalid_detect with service URL vars suggests berth_register', async () => {
    const extras = await checkTriggers(
      'envalid_detect',
      { stdout: 'Found: DATABASE_URL, REDIS_HOST, API_URL', stderr: '', code: 0 },
      tmpDir,
    );
    expect(extras.some((e) => e.includes('berth_register'))).toBe(true);
    const urlHint = extras.find((e) => e.includes('berth_register'))!;
    // Should surface at most 3 distinct examples
    expect(urlHint).toMatch(/DATABASE_URL|REDIS_HOST|API_URL/);
  });

  it('envalid_detect with no URL-like vars emits no hint', async () => {
    const extras = await checkTriggers(
      'envalid_detect',
      { stdout: 'no matches found', stderr: '', code: 0 },
      tmpDir,
    );
    expect(extras).toEqual([]);
  });

  it('velocity_end_task fires when actual_files is double-digit', async () => {
    const extras = await checkTriggers(
      'velocity_end_task',
      { stdout: '{"actual_files": 42}', stderr: '', code: 0 },
      tmpDir,
    );
    expect(extras.some((e) => e.includes('Large change'))).toBe(true);
  });

  it('velocity_end_task does not fire for small changes', async () => {
    const extras = await checkTriggers(
      'velocity_end_task',
      { stdout: '{"actual_files": 2}', stderr: '', code: 0 },
      tmpDir,
    );
    expect(extras).toEqual([]);
  });

  it('aware_init with "wrote" output triggers stale scan', async () => {
    // Provide a controlled spawn to avoid real execution
    mockSpawn.mockImplementation(() => fakeChild('drift detected', 0) as ReturnType<typeof spawn>);
    // Isolate cache writes to a temp HOME? They write to CACHE_DIR; leave them —
    // side effect tolerable for a single test run.
    void CACHE_DIR;
    const extras = await checkTriggers(
      'aware_init',
      { stdout: 'wrote 3 files', stderr: '', code: 0 },
      tmpDir,
    );
    expect(mockSpawn).toHaveBeenCalled();
    expect(extras.some((e) => e.includes('Auto-triggered stale_scan'))).toBe(true);
  });

  it('aware_init without change verbs does not trigger stale scan', async () => {
    mockSpawn.mockImplementation(() => fakeChild('nothing', 0) as ReturnType<typeof spawn>);
    const extras = await checkTriggers(
      'aware_init',
      { stdout: 'validation passed — no changes needed', stderr: '', code: 0 },
      tmpDir,
    );
    // No spawn from the trigger path
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(extras).toEqual([]);
  });
});
