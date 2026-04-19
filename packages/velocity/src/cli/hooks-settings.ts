import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// The shell command used in every hook entry. Matches how install.ts registers
// the MCP server — `npx velocity-mcp` resolves to this package's bin.
export const HOOK_COMMAND_BASE = 'npx velocity-mcp hook';

// Marker so we can reliably find our entries for uninstall/update.
export const HOOK_MARKER = 'velocity-mcp-auto';

type HookCommandEntry = {
  type: 'command';
  command: string;
  // Our marker (custom fields are preserved by Claude Code).
  [HOOK_MARKER]?: true;
};

type HookMatcher = {
  matcher?: string;
  hooks: HookCommandEntry[];
};

type Settings = {
  hooks?: Record<string, HookMatcher[]>;
  [k: string]: unknown;
};

export function claudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

function loadSettings(path: string): Settings {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf-8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Settings;
  } catch {
    // Don't clobber a malformed settings.json — bail loudly.
    throw new Error(`Could not parse ${path} as JSON. Fix it manually and re-run install.`);
  }
}

function writeSettings(path: string, settings: Settings): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function makeEntry(event: string): HookCommandEntry {
  const cmd = (() => {
    switch (event) {
      case 'PreToolUse': return `${HOOK_COMMAND_BASE} pre-tool-use`;
      case 'PostToolUse': return `${HOOK_COMMAND_BASE} post-tool-use`;
      case 'Stop': return `${HOOK_COMMAND_BASE} stop`;
      case 'SessionStart': return `${HOOK_COMMAND_BASE} session-start`;
      default: throw new Error(`unknown hook event: ${event}`);
    }
  })();
  return { type: 'command', command: cmd, [HOOK_MARKER]: true };
}

const EVENT_MATCHERS: Array<{ event: string; matcher?: string }> = [
  { event: 'PreToolUse', matcher: 'Edit|Write|MultiEdit|NotebookEdit' },
  { event: 'PostToolUse', matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash' },
  { event: 'Stop' },
  { event: 'SessionStart' },
];

// Strip any entry whose command matches ours (by substring) or carries our marker.
// This lets us upgrade safely and uninstall cleanly.
function stripVelocityEntries(matchers: HookMatcher[]): HookMatcher[] {
  return matchers
    .map(m => ({
      ...m,
      hooks: m.hooks.filter(h => !(h as HookCommandEntry)[HOOK_MARKER] && !h.command.includes('velocity-mcp hook')),
    }))
    .filter(m => m.hooks.length > 0);
}

export function installHooks(settingsPath: string = claudeSettingsPath()): void {
  const settings = loadSettings(settingsPath);
  settings.hooks ??= {};

  for (const { event, matcher } of EVENT_MATCHERS) {
    const existing = settings.hooks[event] ?? [];
    const cleaned = stripVelocityEntries(existing);
    // Merge our entry into an existing matcher block with the same matcher, or
    // append a new one.
    const entry = makeEntry(event);
    const existingBlock = cleaned.find(m => m.matcher === matcher);
    if (existingBlock) {
      existingBlock.hooks.push(entry);
    } else {
      cleaned.push({ ...(matcher ? { matcher } : {}), hooks: [entry] });
    }
    settings.hooks[event] = cleaned;
  }

  writeSettings(settingsPath, settings);
}

export function uninstallHooks(settingsPath: string = claudeSettingsPath()): void {
  if (!existsSync(settingsPath)) return;
  const settings = loadSettings(settingsPath);
  if (!settings.hooks) return;

  for (const event of Object.keys(settings.hooks)) {
    const cleaned = stripVelocityEntries(settings.hooks[event]);
    if (cleaned.length === 0) {
      delete settings.hooks[event];
    } else {
      settings.hooks[event] = cleaned;
    }
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeSettings(settingsPath, settings);
}
