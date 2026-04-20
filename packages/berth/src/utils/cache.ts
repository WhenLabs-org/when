import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

interface CacheEnvelope<T> {
  cachedAt: string; // ISO
  ttlMs: number;
  value: T;
}

export function getCacheDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  const base = xdg ? xdg : path.join(os.homedir(), '.cache');
  return path.join(base, 'berth');
}

export function getCachePath(key: string): string {
  // Strip anything that could walk the filesystem tree. We disallow "."
  // entirely — extensions are added by this function, not the caller.
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getCacheDir(), `${safe}.json`);
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(getCacheDir(), { recursive: true });
}

/**
 * Read a cached value if it hasn't expired. Returns undefined on a miss —
 * never throws (a corrupt cache is treated the same as no cache).
 */
export async function readCache<T>(key: string, now = Date.now()): Promise<T | undefined> {
  const filePath = getCachePath(key);
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return undefined;
  }
  try {
    const env = JSON.parse(content) as CacheEnvelope<T>;
    const cachedAt = Date.parse(env.cachedAt);
    if (!Number.isFinite(cachedAt)) return undefined;
    if (now - cachedAt > env.ttlMs) return undefined;
    return env.value;
  } catch {
    return undefined;
  }
}

export async function writeCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
  await ensureCacheDir();
  const filePath = getCachePath(key);
  const tmp = filePath + '.tmp';
  const env: CacheEnvelope<T> = {
    cachedAt: new Date().toISOString(),
    ttlMs,
    value,
  };
  await fs.writeFile(tmp, JSON.stringify(env), 'utf-8');
  await fs.rename(tmp, filePath);
}

export async function invalidateCache(key?: string): Promise<void> {
  if (key) {
    try {
      await fs.unlink(getCachePath(key));
    } catch {
      // already gone — fine
    }
    return;
  }
  // Wipe everything in the cache dir.
  try {
    const entries = await fs.readdir(getCacheDir());
    await Promise.all(
      entries.map((e) =>
        fs.unlink(path.join(getCacheDir(), e)).catch(() => {}),
      ),
    );
  } catch {
    // cache dir doesn't exist — fine
  }
}

/**
 * Convenience wrapper: return the cached value if fresh, else call the
 * producer and cache its result.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  producer: () => Promise<T>,
): Promise<T> {
  const hit = await readCache<T>(key);
  if (hit !== undefined) return hit;
  const value = await producer();
  await writeCache(key, value, ttlMs).catch(() => {});
  return value;
}
