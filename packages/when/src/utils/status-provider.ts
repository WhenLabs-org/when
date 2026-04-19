import {
  readStatus as readCachedStatus,
  statusPath,
  statusMtime,
  type CacheStatusSnapshot,
  type CacheToolStatus,
} from './cache.js';

export type ToolStatus = CacheToolStatus;
export type WatchStatus = Omit<CacheStatusSnapshot, 'schemaVersion'>;

export function getStatusPath(): string {
  return statusPath();
}

export function readStatus(): WatchStatus | null {
  const snap = readCachedStatus();
  if (!snap) return null;
  const { schemaVersion: _ignored, ...rest } = snap;
  return rest;
}

export function formatStatusLine(): string | null {
  const data = readStatus();
  if (!data) return null;

  const parts: string[] = [];
  for (const [key, info] of Object.entries(data.tools) as [string, ToolStatus][]) {
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
  const mtime = statusMtime();
  if (mtime === null) return true;
  return Date.now() - mtime > maxAgeMs;
}
