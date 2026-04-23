import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

// Mock spawn to avoid real CLI calls
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock find-bin so we don't need real binaries on PATH
vi.mock('../utils/find-bin.js', () => ({
  findBin: vi.fn((name: string) => name),
}));

import { spawn } from 'node:child_process';
import { createInitCommand } from '../commands/init.js';
import { EventEmitter } from 'node:events';

const mockSpawn = vi.mocked(spawn);

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'when-init-test-'));
  vi.clearAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function withCwd<T>(dir: string, fn: () => T): T {
  const original = process.cwd;
  process.cwd = () => dir;
  try {
    return fn();
  } finally {
    process.cwd = original;
  }
}

/**
 * Create a fake child process that emits stdout data and closes with a given exit code.
 */
function fakeChild(stdout: string, exitCode: number) {
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  // Emit asynchronously so handlers are attached first
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    child.emit('close', exitCode);
  });

  return child;
}

describe('createInitCommand', () => {
  it('returns a Command named init', () => {
    const cmd = createInitCommand();
    expect(cmd.name()).toBe('init');
  });
});

describe('when init — project detection', () => {
  it('detects node stack from package.json', async () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', version: '1.0.0' }),
      'utf-8',
    );

    // All tool spawns return success with empty output
    mockSpawn.mockImplementation(() => fakeChild('{}', 0) as ReturnType<typeof spawn>);

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const cmd = createInitCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'init']));
    } finally {
      console.log = orig;
      process.stdout.write = origWrite;
    }

    expect(logs.some((l) => l.includes('my-app'))).toBe(true);
    expect(logs.some((l) => l.includes('node'))).toBe(true);
  });

  it('falls back to directory name when no package.json', async () => {
    // All tool spawns return exit code 127 (not found) — avoids hanging
    mockSpawn.mockImplementation(() => fakeChild('', 127) as ReturnType<typeof spawn>);

    const dirName = basename(tmpDir);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const cmd = createInitCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'init']));
    } finally {
      console.log = orig;
      process.stdout.write = origWrite;
    }

    expect(logs.some((l) => l.includes(dirName))).toBe(true);
  });
});

describe('when init — bootstrap configs', () => {
  it('skips .env.schema when no .env exists', async () => {
    mockSpawn.mockImplementation(() => fakeChild('', 127) as ReturnType<typeof spawn>);

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const cmd = createInitCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'init']));
    } finally {
      console.log = orig;
      process.stdout.write = origWrite;
    }

    expect(logs.some((l) => l.includes('.env.schema') && l.includes('Skipped'))).toBe(true);
  });

  it('attempts envalid init when .env exists but .env.schema does not', async () => {
    writeFileSync(join(tmpDir, '.env'), 'PORT=3000\n', 'utf-8');

    mockSpawn.mockImplementation(() => fakeChild('', 0) as ReturnType<typeof spawn>);

    const orig = console.log;
    console.log = () => {};
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const cmd = createInitCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'init']));
    } finally {
      console.log = orig;
      process.stdout.write = origWrite;
    }

    const envalidCalls = mockSpawn.mock.calls.filter(
      ([bin, args]) => String(bin) === 'envalid' && Array.isArray(args) && args[0] === 'init',
    );
    expect(envalidCalls.length).toBeGreaterThan(0);
  });

  it('skips vow bootstrap when .vow.yml already exists', async () => {
    writeFileSync(join(tmpDir, '.vow.yml'), 'policy: opensource\n', 'utf-8');

    mockSpawn.mockImplementation(() => fakeChild('', 127) as ReturnType<typeof spawn>);

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const cmd = createInitCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'init']));
    } finally {
      console.log = orig;
      process.stdout.write = origWrite;
    }

    expect(logs.some((l) => l.includes('.vow.yml') && l.includes('Skipped'))).toBe(true);
  });

  it('still honors legacy .vow.json (skips bootstrap)', async () => {
    writeFileSync(join(tmpDir, '.vow.json'), '{"policy":"opensource"}', 'utf-8');

    mockSpawn.mockImplementation(() => fakeChild('', 127) as ReturnType<typeof spawn>);

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const cmd = createInitCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'init']));
    } finally {
      console.log = orig;
      process.stdout.write = origWrite;
    }

    expect(logs.some((l) => l.includes('Skipped'))).toBe(true);
  });

});

describe('when init — summary', () => {
  it('prints "All clear" when all tools return success', async () => {
    // Stale scan returns JSON with 0 issues; others return success JSON
    mockSpawn.mockImplementation((_bin, args) => {
      const argArr = args as string[];
      // stale scan --format json returns stale-shaped JSON
      if (argArr.includes('--format') && argArr.includes('json') && argArr[0] === 'scan') {
        return fakeChild(JSON.stringify({ summary: { errors: 0, warnings: 0 } }), 0) as ReturnType<typeof spawn>;
      }
      // berth check --json
      if (argArr.includes('--json')) {
        return fakeChild(JSON.stringify({ conflicts: [] }), 0) as ReturnType<typeof spawn>;
      }
      // vow scan --format json
      if (argArr[0] === 'scan' && argArr.includes('json')) {
        return fakeChild(JSON.stringify({ packages: [] }), 0) as ReturnType<typeof spawn>;
      }
      return fakeChild(JSON.stringify({}), 0) as ReturnType<typeof spawn>;
    });

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      const cmd = createInitCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'init']));
    } finally {
      console.log = orig;
      process.stdout.write = origWrite;
    }

    expect(logs.some((l) => l.includes('All clear') || l.includes('healthy'))).toBe(true);
  });
});
