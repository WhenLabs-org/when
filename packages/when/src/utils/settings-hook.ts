import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
export const SETTINGS_BACKUP_SUFFIX = '.before-whenlabs';

/** The command the UserPromptSubmit hook invokes. Kept identical across
 *  platforms — `npx -y -p` works on macOS, Linux, and Windows (via WSL /
 *  PowerShell). Using `@latest` guards against stale npx caches. */
export const HOOK_COMMAND = 'npx -y -p @whenlabs/when@latest when doctor --brief';

/** Marker key written alongside our hook entry. Removal targets only the
 *  tagged entry so the user's own UserPromptSubmit hooks survive. */
export const MANAGED_KEY = '_whenlabs_managed';

interface HookLeaf {
  type: string;
  command?: string;
  [MANAGED_KEY]?: boolean;
  [key: string]: unknown;
}

interface HookMatcher {
  matcher?: string;
  hooks?: HookLeaf[];
  [key: string]: unknown;
}

interface SettingsShape {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

function readSettings(filePath: string): SettingsShape {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return {};
  return JSON.parse(raw) as SettingsShape;
}

function writeSettings(filePath: string, settings: SettingsShape): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function hasManagedEntry(matcher: HookMatcher): boolean {
  return (matcher.hooks ?? []).some(h => h[MANAGED_KEY] === true);
}

/** Idempotently add the whenlabs UserPromptSubmit hook to the settings
 *  file at `filePath`. Preserves every unrelated key. On first-ever add
 *  (when no backup file exists yet), copies the original to
 *  `<filePath>.before-whenlabs` so a clobbered settings.json is recoverable. */
export function addWhenlabsHook(filePath: string = SETTINGS_PATH): void {
  // Backup: only on first add, only if the file exists. Never clobber an
  // existing backup — the user may have already run add + hand-edited.
  if (existsSync(filePath)) {
    const backupPath = filePath + SETTINGS_BACKUP_SUFFIX;
    if (!existsSync(backupPath)) {
      copyFileSync(filePath, backupPath);
    }
  }

  const settings = readSettings(filePath);
  settings.hooks ??= {};
  settings.hooks.UserPromptSubmit ??= [];

  // Look for our managed entry. If it already exists, update its command
  // (so bumping the command between versions is clean). If not, add a new
  // matcher block with just our entry — keeping it isolated from any
  // user-owned matcher blocks.
  for (const matcher of settings.hooks.UserPromptSubmit) {
    if (hasManagedEntry(matcher)) {
      const managed = (matcher.hooks ?? []).find(h => h[MANAGED_KEY] === true);
      if (managed) {
        managed.command = HOOK_COMMAND;
      }
      writeSettings(filePath, settings);
      return;
    }
  }

  settings.hooks.UserPromptSubmit.push({
    matcher: '*',
    hooks: [{ type: 'command', command: HOOK_COMMAND, [MANAGED_KEY]: true }],
  });
  writeSettings(filePath, settings);
}

/** Remove ONLY our tagged hook entry. Unrelated matcher blocks and hook
 *  entries are preserved. If removing our entry leaves a matcher block
 *  with no hooks, the empty block is cleaned up. If UserPromptSubmit
 *  becomes empty, the key is removed. If `hooks` becomes empty, it's
 *  removed. Silent no-op when the file is absent or our entry isn't
 *  present. */
export function removeWhenlabsHook(filePath: string = SETTINGS_PATH): void {
  if (!existsSync(filePath)) return;
  const settings = readSettings(filePath);
  const prompt = settings.hooks?.UserPromptSubmit;
  if (!prompt) return;

  const updated: HookMatcher[] = [];
  for (const matcher of prompt) {
    const filteredHooks = (matcher.hooks ?? []).filter(h => h[MANAGED_KEY] !== true);
    if (filteredHooks.length > 0) {
      updated.push({ ...matcher, hooks: filteredHooks });
    } else if (matcher.hooks === undefined) {
      // Preserve matcher blocks that never had a hooks array to begin with;
      // those aren't ours to touch.
      updated.push(matcher);
    }
    // Otherwise (the matcher existed only to host our entry): drop it.
  }

  if (updated.length > 0) {
    settings.hooks!.UserPromptSubmit = updated;
  } else {
    delete settings.hooks!.UserPromptSubmit;
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeSettings(filePath, settings);
}
