import fs from 'node:fs/promises';
import { getCurrentPlatform, shellExec } from './platform.js';
import type { ProcessAncestry, TerminalHost } from '../types.js';

const MAX_DEPTH = 10;
const SHELL_EXEC_TIMEOUT = 3000;

interface PsRow {
  pid: number;
  ppid: number;
  lstart?: string;
  command: string;
  args?: string;
}

export async function getProcessAncestry(pid: number): Promise<ProcessAncestry | undefined> {
  const platform = getCurrentPlatform();
  if (pid <= 0) return undefined;

  if (platform === 'win32') {
    return ancestryWindows(pid);
  }
  return ancestryPosix(pid);
}

async function ancestryPosix(pid: number): Promise<ProcessAncestry | undefined> {
  const self = await psRow(pid);
  if (!self) return undefined;

  const parents: Array<{ pid: number; command: string; args?: string }> = [];
  let cursor = self.ppid;
  let depth = 0;
  while (cursor > 1 && depth < MAX_DEPTH) {
    const row = await psRow(cursor);
    if (!row) break;
    parents.push({ pid: row.pid, command: row.command, args: row.args });
    cursor = row.ppid;
    depth++;
  }

  const terminal = await detectTerminalHost(self, parents);

  return {
    pid: self.pid,
    startedAt: normalizeLstart(self.lstart),
    parents,
    terminal,
  };
}

async function psRow(pid: number): Promise<PsRow | undefined> {
  // Use %x as column separator to avoid ambiguity with spaces in lstart/args.
  // `ps -o` with multiple fields uses a fixed column format; we split manually.
  try {
    const result = await shellExec(
      'ps',
      ['-o', 'pid=,ppid=,lstart=,comm=,args=', '-p', String(pid)],
      { timeout: SHELL_EXEC_TIMEOUT },
    );
    const line = result.stdout.trim();
    if (!line) return undefined;

    return parsePsLine(line);
  } catch {
    return undefined;
  }
}

/**
 * Parse a `ps` line produced by `-o pid=,ppid=,lstart=,comm=,args=`.
 *
 *   pid=<int> ppid=<int> lstart=<Weekday Mon Day HH:MM:SS Year> comm=<path> args=<rest>
 *
 * `lstart` is a fixed 5-token format (e.g. "Thu Jan  1 12:34:56 2024") and
 * `comm` is the basename without spaces, so we can carve off fields by token
 * count and assign the remainder to args.
 */
export function parsePsLine(line: string): PsRow | undefined {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 9) return undefined;

  const pid = parseInt(tokens[0], 10);
  const ppid = parseInt(tokens[1], 10);
  if (!Number.isFinite(pid) || !Number.isFinite(ppid)) return undefined;

  // lstart = tokens[2..6] (5 tokens)
  const lstart = tokens.slice(2, 7).join(' ');
  const command = tokens[7];
  const args = tokens.slice(8).join(' ') || undefined;

  return { pid, ppid, lstart, command, args };
}

function normalizeLstart(lstart?: string): string | undefined {
  if (!lstart) return undefined;
  const d = new Date(lstart);
  if (Number.isNaN(d.getTime())) return lstart;
  return d.toISOString();
}

/**
 * Try to identify which terminal (tmux/screen/vscode/etc.) spawned the
 * process. Reads env from /proc on Linux; `ps -E` on macOS. Best effort.
 */
async function detectTerminalHost(
  self: PsRow,
  parents: Array<{ pid: number; command: string; args?: string }>,
): Promise<TerminalHost | undefined> {
  const env = await readProcessEnv(self.pid);

  if (env) {
    if (env.TMUX_PANE || env.TMUX) {
      return {
        kind: 'tmux',
        pane: env.TMUX_PANE,
        windowTitle: env.TMUX ? env.TMUX.split(',')[0] : undefined,
      };
    }
    if (env.STY) return { kind: 'screen', windowTitle: env.STY };
    if (env.VSCODE_INJECTION || env.TERM_PROGRAM === 'vscode') return { kind: 'vscode' };
    if (env.TERM_PROGRAM === 'iTerm.app' || env.ITERM_SESSION_ID) return { kind: 'iterm' };
    if (env.KITTY_WINDOW_ID) return { kind: 'kitty' };
    if (env.WT_SESSION) return { kind: 'windows-terminal' };
    if (env.TERM_PROGRAM === 'Apple_Terminal') return { kind: 'apple-terminal' };
  }

  // Fallback: pattern-match parent commands.
  for (const p of parents) {
    if (/\btmux\b/.test(p.command)) return { kind: 'tmux' };
    if (/\bscreen\b/.test(p.command)) return { kind: 'screen' };
    if (/\bcode\b/.test(p.command)) return { kind: 'vscode' };
  }

  return undefined;
}

async function readProcessEnv(pid: number): Promise<Record<string, string> | undefined> {
  const platform = getCurrentPlatform();
  if (platform === 'linux') {
    try {
      const raw = await fs.readFile(`/proc/${pid}/environ`, 'utf-8');
      return parseEnvBlob(raw);
    } catch {
      return undefined;
    }
  }
  if (platform === 'darwin') {
    // `ps -E` prints env vars inline after the command. Privilege-dependent;
    // fail silently when not allowed.
    try {
      const result = await shellExec('ps', ['-E', '-o', 'args=', '-p', String(pid)], {
        timeout: SHELL_EXEC_TIMEOUT,
      });
      return parsePsEnvLine(result.stdout);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function parseEnvBlob(blob: string): Record<string, string> {
  // /proc/<pid>/environ is NUL-separated KEY=VALUE entries
  const out: Record<string, string> = {};
  for (const entry of blob.split('\0')) {
    if (!entry) continue;
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    out[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return out;
}

/**
 * Best-effort env parsing from `ps -E` output on macOS. The format is the
 * command followed by space-separated `KEY=VALUE` pairs; values may contain
 * spaces only when the process deliberately embeds them, which is rare.
 */
export function parsePsEnvLine(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const tokens = line.trim().split(/\s+/);
  for (const t of tokens) {
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq);
    // only accept all-caps env-style keys to avoid eating args like --foo=bar
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    out[key] = t.slice(eq + 1);
  }
  return out;
}

async function ancestryWindows(pid: number): Promise<ProcessAncestry | undefined> {
  // Best effort via `wmic` (deprecated in newer Windows but still widely
  // present). Returns shallow ancestry (self + immediate parent).
  try {
    const result = await shellExec(
      'wmic',
      [
        'process',
        'where',
        `processid=${pid}`,
        'get',
        'processid,parentprocessid,creationdate,name',
        '/FORMAT:csv',
      ],
      { timeout: SHELL_EXEC_TIMEOUT },
    );
    const parsed = parseWmicCsv(result.stdout);
    if (!parsed) return undefined;
    return {
      pid,
      startedAt: parsed.startedAt,
      parents: parsed.ppid ? [{ pid: parsed.ppid, command: 'unknown' }] : [],
    };
  } catch {
    return undefined;
  }
}

export function parseWmicCsv(
  output: string,
): { ppid: number; startedAt?: string } | undefined {
  const lines = output.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return undefined;
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const data = lines[1].split(',');
  const ppidIdx = header.indexOf('parentprocessid');
  const startIdx = header.indexOf('creationdate');
  if (ppidIdx < 0) return undefined;
  const ppid = parseInt(data[ppidIdx], 10);
  if (!Number.isFinite(ppid)) return undefined;
  return {
    ppid,
    startedAt: startIdx >= 0 ? normalizeWmicDate(data[startIdx]?.trim()) : undefined,
  };
}

function normalizeWmicDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // WMIC creationdate is YYYYMMDDHHMMSS.mmmmmm+ZZZ
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.\d+[+-]\d+$/);
  if (!match) return raw;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
}

/**
 * Resolve ancestry for many PIDs with bounded concurrency.
 */
export async function resolveAncestries(
  pids: number[],
  concurrency = 8,
): Promise<Map<number, ProcessAncestry | undefined>> {
  const unique = Array.from(new Set(pids));
  const result = new Map<number, ProcessAncestry | undefined>();

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < unique.length) {
      const idx = cursor++;
      const pid = unique[idx];
      result.set(pid, await getProcessAncestry(pid));
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, () => worker());
  await Promise.all(workers);
  return result;
}
