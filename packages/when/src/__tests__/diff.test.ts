import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock runCli and writeCache from run-cli before importing diff command
vi.mock('../mcp/run-cli.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mcp/run-cli.js')>();
  return {
    ...actual,
    runCli: vi.fn(),
    writeCache: vi.fn(),
    CACHE_DIR: join(tmpdir(), 'when-diff-cache-test-' + process.pid),
  };
});

import { runCli, writeCache, CACHE_DIR } from '../mcp/run-cli.js';
import { mkdirSync } from 'node:fs';
import { createDiffCommand } from '../commands/diff.js';

const mockRunCli = vi.mocked(runCli);
const mockWriteCache = vi.mocked(writeCache);

let tmpDir: string;

function freshResult(output: string, code = 0) {
  return { stdout: output, stderr: '', code };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'when-diff-test-'));
  vi.clearAllMocks();
  process.exitCode = undefined;

  // Default: all tools return empty output
  mockRunCli.mockResolvedValue(freshResult(''));
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

function writeCacheFile(tool: string, project: string, output: string, code = 0): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    join(CACHE_DIR, `${tool}_${project}.json`),
    JSON.stringify({ timestamp: Date.now() - 60000, output, code }),
    'utf-8',
  );
}

describe('createDiffCommand', () => {
  it('returns a Command named diff', () => {
    const cmd = createDiffCommand();
    expect(cmd.name()).toBe('diff');
  });
});

describe('when diff — no prior cache', () => {
  it('treats fresh output as baseline when no cache exists', async () => {
    mockRunCli.mockResolvedValue(freshResult('stale output line'));

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createDiffCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'diff']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('baseline') || l.includes('no prior cache'))).toBe(true);
    expect(mockWriteCache).toHaveBeenCalled();
  });
});

describe('when diff — with prior cache', () => {
  it('shows "no changes" when output is identical', async () => {
    const project = tmpDir.split('/').filter(Boolean).pop()!;
    writeCacheFile('stale', project, 'same line');
    writeCacheFile('envalid', project, '');
    writeCacheFile('berth', project, '');
    writeCacheFile('vow', project, '');
    writeCacheFile('aware', project, '');

    mockRunCli.mockResolvedValue(freshResult('same line'));

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createDiffCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'diff']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('no changes') || l.includes('unchanged'))).toBe(true);
  });

  it('shows added lines in output when new issues appear', async () => {
    const project = tmpDir.split('/').filter(Boolean).pop()!;
    writeCacheFile('stale', project, 'existing issue');
    writeCacheFile('envalid', project, '');
    writeCacheFile('berth', project, '');
    writeCacheFile('vow', project, '');
    writeCacheFile('aware', project, '');

    // stale returns a new issue, others return empty
    mockRunCli.mockImplementation(async (bin: string) => {
      if (bin === 'stale') return freshResult('existing issue\nnew issue detected');
      return freshResult('');
    });

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createDiffCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'diff']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('new issue detected'))).toBe(true);
    // "+" prefix indicates a new (added) issue
    expect(logs.some((l) => l.includes('+'))).toBe(true);
  });

  it('shows resolved lines when old issues disappear', async () => {
    const project = tmpDir.split('/').filter(Boolean).pop()!;
    writeCacheFile('stale', project, 'old resolved issue\nstill present');
    writeCacheFile('envalid', project, '');
    writeCacheFile('berth', project, '');
    writeCacheFile('vow', project, '');
    writeCacheFile('aware', project, '');

    mockRunCli.mockImplementation(async (bin: string) => {
      if (bin === 'stale') return freshResult('still present');
      return freshResult('');
    });

    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    try {
      const cmd = createDiffCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'diff']));
    } finally {
      console.log = orig;
    }

    expect(logs.some((l) => l.includes('old resolved issue'))).toBe(true);
    // "-" prefix indicates resolved
    expect(logs.some((l) => l.includes('-'))).toBe(true);
  });

  it('writes updated cache after comparison', async () => {
    const project = tmpDir.split('/').filter(Boolean).pop()!;
    writeCacheFile('stale', project, 'old output');
    writeCacheFile('envalid', project, '');
    writeCacheFile('berth', project, '');
    writeCacheFile('vow', project, '');
    writeCacheFile('aware', project, '');

    mockRunCli.mockResolvedValue(freshResult('new output'));

    const orig = console.log;
    console.log = () => {};
    try {
      const cmd = createDiffCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'diff']));
    } finally {
      console.log = orig;
    }

    // writeCache should be called once per tool (5 tools)
    expect(mockWriteCache).toHaveBeenCalledTimes(5);
  });

  it('calls runCli for all 5 tools', async () => {
    const project = tmpDir.split('/').filter(Boolean).pop()!;
    ['stale', 'envalid', 'berth', 'vow', 'aware'].forEach((t) =>
      writeCacheFile(t, project, ''),
    );

    mockRunCli.mockResolvedValue(freshResult(''));

    const orig = console.log;
    console.log = () => {};
    try {
      const cmd = createDiffCommand();
      await withCwd(tmpDir, () => cmd.parseAsync(['node', 'when', 'diff']));
    } finally {
      console.log = orig;
    }

    const bins = mockRunCli.mock.calls.map(([bin]) => bin);
    expect(bins).toContain('stale');
    expect(bins).toContain('envalid');
    expect(bins).toContain('berth');
    expect(bins).toContain('vow');
    expect(bins).toContain('aware');
  });
});
