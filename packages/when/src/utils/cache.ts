import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT_DIR = join(homedir(), '.whenlabs');
const ENTRIES_DIR = join(ROOT_DIR, 'cache');

const SCHEMA_VERSION = 1 as const;

export interface CacheEntry {
  schemaVersion: typeof SCHEMA_VERSION;
  timestamp: number;
  tool: string;
  project: string;
  output: string;
  /** 0 when the scan reported ok, 1 otherwise. Not a process exit code. */
  code: number;
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

export function entriesDir(): string {
  return ENTRIES_DIR;
}
