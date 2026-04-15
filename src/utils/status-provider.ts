import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, statSync } from 'node:fs';

const STATUS_PATH = join(homedir(), '.whenlabs', 'status.json');

export interface ToolStatus {
  status: 'ok' | 'issues' | 'error';
  count: number;
  detail: string;
}

export interface WatchStatus {
  timestamp: string;
  tools: {
    stale: ToolStatus;
    envalid: ToolStatus;
    berth: ToolStatus;
    vow: ToolStatus;
    aware: ToolStatus;
  };
  summary: string;
}

export function getStatusPath(): string {
  return STATUS_PATH;
}

export function readStatus(): WatchStatus | null {
  if (!existsSync(STATUS_PATH)) return null;
  try {
    const raw = readFileSync(STATUS_PATH, 'utf-8');
    return JSON.parse(raw) as WatchStatus;
  } catch {
    return null;
  }
}

export function formatStatusLine(): string | null {
  const data = readStatus();
  if (!data) return null;

  const tools = data.tools;
  const parts: string[] = [];

  for (const [key, info] of Object.entries(tools) as [string, ToolStatus][]) {
    const label = key === 'envalid' ? 'env' : key === 'vow' ? 'lic' : key;
    if (info.status === 'ok') {
      parts.push(`\u2713${label}`);
    } else if (info.status === 'issues') {
      parts.push(`\u2717${label}:${info.count}`);
    } else {
      parts.push(`!${label}`);
    }
  }

  return parts.join(' ');
}

export function isStale(maxAgeMs: number = 120 * 60 * 1000): boolean {
  if (!existsSync(STATUS_PATH)) return true;
  try {
    const stat = statSync(STATUS_PATH);
    return Date.now() - stat.mtimeMs > maxAgeMs;
  } catch {
    return true;
  }
}
