import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addWhenlabsHook,
  removeWhenlabsHook,
  HOOK_COMMAND,
  MANAGED_KEY,
  SETTINGS_BACKUP_SUFFIX,
} from '../utils/settings-hook.js';

let tmpDir: string;
let settingsPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'when-settings-hook-'));
  settingsPath = join(tmpDir, 'settings.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function read(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('addWhenlabsHook', () => {
  it('creates settings.json and writes a tagged UserPromptSubmit entry', () => {
    addWhenlabsHook(settingsPath);
    expect(existsSync(settingsPath)).toBe(true);
    const s = read(settingsPath) as {
      hooks: { UserPromptSubmit: Array<{ matcher: string; hooks: Array<Record<string, unknown>> }> };
    };
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
    expect(s.hooks.UserPromptSubmit[0].matcher).toBe('*');
    expect(s.hooks.UserPromptSubmit[0].hooks).toHaveLength(1);
    expect(s.hooks.UserPromptSubmit[0].hooks[0]).toMatchObject({
      type: 'command',
      command: HOOK_COMMAND,
      [MANAGED_KEY]: true,
    });
  });

  it('is idempotent — second call does not duplicate the entry', () => {
    addWhenlabsHook(settingsPath);
    addWhenlabsHook(settingsPath);
    const s = read(settingsPath) as {
      hooks: { UserPromptSubmit: Array<{ hooks: Array<unknown> }> };
    };
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
    expect(s.hooks.UserPromptSubmit[0].hooks).toHaveLength(1);
  });

  it('preserves unrelated user hooks (different hook event)', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo done' }] }],
        },
      }),
      'utf-8',
    );
    addWhenlabsHook(settingsPath);
    const s = read(settingsPath) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ command: string }> }>;
        UserPromptSubmit: Array<{ hooks: Array<unknown> }>;
      };
    };
    expect(s.hooks.Stop[0].hooks[0].command).toBe('echo done');
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
  });

  it('preserves unrelated UserPromptSubmit matchers from the user', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo bash-only' }] },
          ],
        },
      }),
      'utf-8',
    );
    addWhenlabsHook(settingsPath);
    const s = read(settingsPath) as {
      hooks: {
        UserPromptSubmit: Array<{
          matcher: string;
          hooks: Array<{ command?: string; [key: string]: unknown }>;
        }>;
      };
    };
    expect(s.hooks.UserPromptSubmit).toHaveLength(2);
    const userBlock = s.hooks.UserPromptSubmit.find(m => m.matcher === 'Bash');
    expect(userBlock?.hooks[0].command).toBe('echo bash-only');
    const ourBlock = s.hooks.UserPromptSubmit.find(
      m => m.hooks?.some(h => h[MANAGED_KEY] === true),
    );
    expect(ourBlock).toBeDefined();
  });

  it('updates the managed hook command when re-installed with a different version', () => {
    // Simulate an older installed hook with a legacy command.
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              matcher: '*',
              hooks: [{ type: 'command', command: 'old-cmd', [MANAGED_KEY]: true }],
            },
          ],
        },
      }),
      'utf-8',
    );
    addWhenlabsHook(settingsPath);
    const s = read(settingsPath) as {
      hooks: { UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
    expect(s.hooks.UserPromptSubmit[0].hooks[0].command).toBe(HOOK_COMMAND);
  });

  it('creates a backup at settings.json.before-whenlabs on first add only', () => {
    const originalContent = JSON.stringify({ existing: 'user config' });
    writeFileSync(settingsPath, originalContent, 'utf-8');
    addWhenlabsHook(settingsPath);

    const backupPath = settingsPath + SETTINGS_BACKUP_SUFFIX;
    expect(existsSync(backupPath)).toBe(true);
    expect(readFileSync(backupPath, 'utf-8')).toBe(originalContent);

    // Overwrite backup to confirm second-add does not clobber.
    writeFileSync(backupPath, 'sentinel — must not be overwritten', 'utf-8');
    addWhenlabsHook(settingsPath);
    expect(readFileSync(backupPath, 'utf-8')).toBe('sentinel — must not be overwritten');
  });

  it('does not create a backup when settings.json does not pre-exist', () => {
    addWhenlabsHook(settingsPath);
    expect(existsSync(settingsPath + SETTINGS_BACKUP_SUFFIX)).toBe(false);
  });
});

describe('removeWhenlabsHook', () => {
  it('removes only our tagged entry, leaves the rest', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo done' }] }],
          UserPromptSubmit: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'user-cmd' }] },
            {
              matcher: '*',
              hooks: [{ type: 'command', command: HOOK_COMMAND, [MANAGED_KEY]: true }],
            },
          ],
        },
      }),
      'utf-8',
    );

    removeWhenlabsHook(settingsPath);
    const s = read(settingsPath) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ command: string }> }>;
        UserPromptSubmit: Array<{ matcher: string; hooks: Array<unknown> }>;
      };
    };
    expect(s.hooks.Stop[0].hooks[0].command).toBe('echo done');
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
    expect(s.hooks.UserPromptSubmit[0].matcher).toBe('Bash');
  });

  it('drops the UserPromptSubmit key entirely when our entry was the only one', () => {
    addWhenlabsHook(settingsPath);
    removeWhenlabsHook(settingsPath);
    const s = read(settingsPath) as { hooks?: Record<string, unknown> };
    expect(s.hooks).toBeUndefined();
  });

  it('is a no-op when settings.json does not exist', () => {
    expect(() => removeWhenlabsHook(settingsPath)).not.toThrow();
    expect(existsSync(settingsPath)).toBe(false);
  });

  it('is a no-op when our entry is not present', () => {
    const originalContent = JSON.stringify(
      {
        hooks: {
          Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo done' }] }],
        },
      },
      null,
      2,
    );
    writeFileSync(settingsPath, originalContent, 'utf-8');
    removeWhenlabsHook(settingsPath);
    const s = read(settingsPath) as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(s.hooks.Stop[0].hooks[0].command).toBe('echo done');
  });

  it('preserves a shared matcher block that had both user and managed hooks', () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              matcher: '*',
              hooks: [
                { type: 'command', command: 'user-cmd' },
                { type: 'command', command: HOOK_COMMAND, [MANAGED_KEY]: true },
              ],
            },
          ],
        },
      }),
      'utf-8',
    );
    removeWhenlabsHook(settingsPath);
    const s = read(settingsPath) as {
      hooks: { UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
    expect(s.hooks.UserPromptSubmit[0].hooks).toHaveLength(1);
    expect(s.hooks.UserPromptSubmit[0].hooks[0].command).toBe('user-cmd');
  });
});
