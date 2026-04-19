import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const ROOT_DIR = join(homedir(), '.whenlabs');
const ENTRIES_DIR = join(ROOT_DIR, 'cache');
const STATUS_PATH = join(ROOT_DIR, 'status.json');

const SCHEMA_VERSION = 1 as const;

export interface CacheEntry {
  schemaVersion: typeof SCHEMA_VERSION;
  timestamp: number;
  tool: string;
  project: string;
  output: string;
  /**
   * Scan outcome: 0 when the scan reported ok, 1 otherwise. Historically this
   * was a CLI exit code, but with createTool()-driven scans it's synthesized
   * from `scan.ok`. Consumers treat it as a boolean (0 vs. non-zero).
   */
  code: number;
}

export interface CacheToolStatus {
  status: 'ok' | 'issues' | 'error';
  count: number;
  detail: string;
}

export interface CacheStatusSnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  timestamp: string;
  tools: {
    stale: CacheToolStatus;
    envalid: CacheToolStatus;
    berth: CacheToolStatus;
    vow: CacheToolStatus;
    aware: CacheToolStatus;
  };
  summary: string;
}

function ensureDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort
  }
}

function entryPath(tool: string, project: string): string {
  return join(ENTRIES_DIR, `${tool}_${project}.json`);
}

/** See {@link CacheEntry.code} for `code` semantics. */
export function writeEntry(tool: string, project: string, output: string, code: number): void {
  ensureDir(ENTRIES_DIR);
  const entry: CacheEntry = {
    schemaVersion: SCHEMA_VERSION,
    timestamp: Date.now(),
    tool,
    project,
    output,
    code,
  };
  try {
    writeFileSync(entryPath(tool, project), JSON.stringify(entry));
  } catch {
    // best-effort
  }
}

export function readEntry(tool: string, project: string): CacheEntry | null {
  const file = entryPath(tool, project);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<CacheEntry>;
    return {
      schemaVersion: SCHEMA_VERSION,
      timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : 0,
      tool: typeof raw.tool === 'string' ? raw.tool : tool,
      project: typeof raw.project === 'string' ? raw.project : project,
      output: typeof raw.output === 'string' ? raw.output : '',
      code: typeof raw.code === 'number' ? raw.code : 1,
    };
  } catch {
    return null;
  }
}

export function writeStatus(snapshot: Omit<CacheStatusSnapshot, 'schemaVersion'>): void {
  ensureDir(ROOT_DIR);
  const payload: CacheStatusSnapshot = { schemaVersion: SCHEMA_VERSION, ...snapshot };
  writeFileSync(STATUS_PATH, JSON.stringify(payload, null, 2) + '\n');
}

export function readStatus(): CacheStatusSnapshot | null {
  if (!existsSync(STATUS_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(STATUS_PATH, 'utf-8')) as Partial<CacheStatusSnapshot>;
    if (!parsed || typeof parsed !== 'object' || !parsed.tools) return null;
    return parsed as CacheStatusSnapshot;
  } catch {
    return null;
  }
}

export function statusPath(): string {
  return STATUS_PATH;
}

export function entriesDir(): string {
  return ENTRIES_DIR;
}

export function statusMtime(): number | null {
  if (!existsSync(STATUS_PATH)) return null;
  try {
    return statSync(STATUS_PATH).mtimeMs;
  } catch {
    return null;
  }
}
