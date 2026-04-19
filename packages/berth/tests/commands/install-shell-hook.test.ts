import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  installShellHookCommand,
  __test__,
} from '../../src/commands/install-shell-hook.js';

const { appendHook, stripMarkers, HOOKS, MARKER_START, MARKER_END } = __test__;

let tmpDir: string;
let rcPath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-hook-'));
  rcPath = path.join(tmpDir, '.bashrc');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('markers', () => {
  it('appendHook adds markers to an empty rc', () => {
    const next = appendHook('', HOOKS.bash);
    expect(next).toContain(MARKER_START);
    expect(next).toContain(MARKER_END);
  });

  it('appendHook is idempotent — re-running replaces the prior block', () => {
    const once = appendHook('# existing rc\n', HOOKS.bash);
    const twice = appendHook(once, HOOKS.bash);
    // Only one pair of markers at the end
    const startCount = twice.split(MARKER_START).length - 1;
    const endCount = twice.split(MARKER_END).length - 1;
    expect(startCount).toBe(1);
    expect(endCount).toBe(1);
    expect(twice).toContain('# existing rc');
  });

  it('stripMarkers removes a previously-installed hook', () => {
    const rc = '# existing rc\n\n' + HOOKS.zsh + '\n\nalias x=y\n';
    const stripped = stripMarkers(rc);
    expect(stripped).not.toContain(MARKER_START);
    expect(stripped).toContain('# existing rc');
    expect(stripped).toContain('alias x=y');
  });

  it('stripMarkers is a no-op when there is no hook', () => {
    const rc = '# no hook here\n';
    expect(stripMarkers(rc)).toBe(rc);
  });
});

describe('installShellHookCommand', () => {
  it('writes the bash hook into a fresh rc file', async () => {
    await installShellHookCommand({
      json: true,
      verbose: false,
      noColor: false,
      shell: 'bash',
      rcPath,
    });
    const rc = await fs.readFile(rcPath, 'utf-8');
    expect(rc).toContain(MARKER_START);
    expect(rc).toContain('__berth_cd_hook');
  });

  it('is idempotent — running twice yields one marker block', async () => {
    await fs.writeFile(rcPath, '# existing\n');
    await installShellHookCommand({
      json: true,
      verbose: false,
      noColor: false,
      shell: 'bash',
      rcPath,
    });
    await installShellHookCommand({
      json: true,
      verbose: false,
      noColor: false,
      shell: 'bash',
      rcPath,
    });
    const rc = await fs.readFile(rcPath, 'utf-8');
    const startCount = rc.split(MARKER_START).length - 1;
    expect(startCount).toBe(1);
    expect(rc).toContain('# existing');
  });

  it('removes the hook on --uninstall', async () => {
    await installShellHookCommand({
      json: true,
      verbose: false,
      noColor: false,
      shell: 'bash',
      rcPath,
    });
    await installShellHookCommand({
      json: true,
      verbose: false,
      noColor: false,
      shell: 'bash',
      rcPath,
      uninstall: true,
    });
    const rc = await fs.readFile(rcPath, 'utf-8');
    expect(rc).not.toContain(MARKER_START);
  });

  it('--print outputs the hook without touching the filesystem', async () => {
    const logSpy = (console.log as any).mockClear();
    await installShellHookCommand({
      json: true,
      verbose: false,
      noColor: false,
      shell: 'zsh',
      print: true,
      rcPath,
    });
    // rc file should not be created
    await expect(fs.access(rcPath)).rejects.toThrow();
    expect(logSpy.mock.calls[0][0]).toContain(MARKER_START);
  });

  it('fails cleanly when shell cannot be detected and --shell not given', async () => {
    const saved = process.env.SHELL;
    delete process.env.SHELL;
    try {
      await installShellHookCommand({
        json: true,
        verbose: false,
        noColor: false,
        rcPath,
      });
      expect(process.exitCode).toBe(2);
    } finally {
      process.env.SHELL = saved;
    }
  });

  it('creates the fish config dir if needed', async () => {
    const fishPath = path.join(tmpDir, '.config', 'fish', 'config.fish');
    await installShellHookCommand({
      json: true,
      verbose: false,
      noColor: false,
      shell: 'fish',
      rcPath: fishPath,
    });
    const rc = await fs.readFile(fishPath, 'utf-8');
    expect(rc).toContain('__berth_cd_hook');
  });
});
