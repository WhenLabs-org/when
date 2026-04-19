import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { createReadStream } from 'node:fs';
import { getRegistryDir } from '../registry/store.js';
import type { HistoryEvent } from './events.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const LAST_STATUS_FILE = 'last-status.json';

export function getHistoryPath(): string {
  return path.join(getRegistryDir(), 'history.jsonl');
}

export function getLastStatusPath(): string {
  return path.join(getRegistryDir(), LAST_STATUS_FILE);
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * Rotate the history file if it exceeds the size threshold. Called from
 * `appendEvents` once per invocation — cheap when the file is small.
 */
async function maybeRotate(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size < MAX_FILE_BYTES) return;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rotated = `${filePath.replace(/\.jsonl$/, '')}-${date}.jsonl.bak`;
    await fs.rename(filePath, rotated);
  } catch {
    // File doesn't exist yet — nothing to rotate.
  }
}

export async function appendEvents(
  events: HistoryEvent[],
  filePath = getHistoryPath(),
): Promise<void> {
  if (events.length === 0) return;
  await ensureDir(filePath);
  await maybeRotate(filePath);
  const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.appendFile(filePath, body, 'utf-8');
}

export async function appendEvent(event: HistoryEvent, filePath?: string): Promise<void> {
  await appendEvents([event], filePath);
}

export interface ReadOptions {
  since?: Date;
  until?: Date;
  port?: number;
  limit?: number;
  type?: HistoryEvent['type'];
}

export async function readEvents(
  options: ReadOptions = {},
  filePath = getHistoryPath(),
): Promise<HistoryEvent[]> {
  let exists = true;
  try {
    await fs.access(filePath);
  } catch {
    exists = false;
  }
  if (!exists) return [];

  const results: HistoryEvent[] = [];
  const rl = readline.createInterface({ input: createReadStream(filePath, 'utf-8') });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let event: HistoryEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (options.type && event.type !== options.type) continue;
    if (options.port !== undefined && (event as { port?: number }).port !== options.port) continue;
    if (options.since && new Date(event.at) < options.since) continue;
    if (options.until && new Date(event.at) > options.until) continue;
    results.push(event);
    if (options.limit !== undefined && results.length >= options.limit) break;
  }
  return results;
}

/**
 * Parse a relative time expression ("1h", "2d", "30m") OR an ISO date. Tests
 * may pass an explicit `now` for determinism.
 */
export function parseSince(input: string, now: Date = new Date()): Date {
  const match = input.match(/^(\d+)([smhdw])$/);
  if (match) {
    const n = parseInt(match[1], 10);
    const unit: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
    };
    return new Date(now.getTime() - n * unit[match[2]]);
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid --since value "${input}" — use 1h / 2d / ISO date`);
  }
  return d;
}

export interface PortSnapshot {
  pid: number;
  process: string;
  project?: string;
}

export interface LastStatusFile {
  timestamp: string;
  ports: Record<string, PortSnapshot>;
}

export async function readLastStatus(
  filePath = getLastStatusPath(),
): Promise<LastStatusFile | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as LastStatusFile;
  } catch {
    return undefined;
  }
}

export async function writeLastStatus(
  snapshot: LastStatusFile,
  filePath = getLastStatusPath(),
): Promise<void> {
  await ensureDir(filePath);
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf-8');
  await fs.rename(tmp, filePath);
}

/**
 * Compare a new snapshot against the previous one and return synthesized
 * claim/release events. Callers append these to the history log.
 */
export function diffSnapshots(
  prev: LastStatusFile | undefined,
  next: LastStatusFile,
): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  const prevPorts = prev?.ports ?? {};
  for (const [portStr, cur] of Object.entries(next.ports)) {
    const before = prevPorts[portStr];
    if (!before || before.pid !== cur.pid) {
      if (before && before.pid !== cur.pid) {
        // Released the old pid
        events.push({
          type: 'port-released',
          at: next.timestamp,
          port: parseInt(portStr, 10),
          pid: before.pid,
        });
      }
      events.push({
        type: 'port-claimed',
        at: next.timestamp,
        port: parseInt(portStr, 10),
        pid: cur.pid,
        process: cur.process,
        project: cur.project,
      });
    }
  }
  for (const [portStr, before] of Object.entries(prevPorts)) {
    if (!(portStr in next.ports)) {
      events.push({
        type: 'port-released',
        at: next.timestamp,
        port: parseInt(portStr, 10),
        pid: before.pid,
      });
    }
  }
  return events;
}

// Allow tests to override the default paths via env.
export function defaultPathsFromEnv(): { history?: string; lastStatus?: string } {
  const baseDir = process.env.BERTH_HOME;
  if (!baseDir) return {};
  return {
    history: path.join(baseDir, 'history.jsonl'),
    lastStatus: path.join(baseDir, LAST_STATUS_FILE),
  };
}

export async function historyFileStats(filePath = getHistoryPath()): Promise<{ size: number } | undefined> {
  try {
    const stat = await fs.stat(filePath);
    return { size: stat.size };
  } catch {
    return undefined;
  }
}

// os.tmpdir reference so IDEs hint the module path; used by tests only.
export const TMP_DIR_REF = os.tmpdir;
