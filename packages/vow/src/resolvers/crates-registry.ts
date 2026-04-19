import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type RegistryFetch = typeof fetch;

export interface CratesRegistryOptions {
  fetch?: RegistryFetch;
  cacheDir?: string;
  ttlMs?: number;
  disabled?: boolean;
}

interface CacheEntry {
  fetchedAt: string;
  status: 'ok' | 'not-found';
  license: string | null;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

function defaultCacheDir(): string {
  if (process.env['VOW_REGISTRY_CACHE_DIR']) {
    return path.join(process.env['VOW_REGISTRY_CACHE_DIR']!, 'crates');
  }
  return path.join(os.homedir(), '.cache', 'vow', 'registry', 'crates');
}

function shouldSkipDiskCache(explicitCacheDir: boolean): boolean {
  if (explicitCacheDir) return false;
  return !!process.env['VITEST'] && !process.env['VOW_REGISTRY_CACHE_DIR'];
}

function sanitizeKey(name: string, version: string): string {
  const safe = `${name}@${version}`.replace(/[^\w.@+-]/g, '_');
  return `${safe}.json`;
}

/**
 * Crates.io version endpoint response.
 * https://crates.io/api/v1/crates/{name}/{version}
 * Returns `{ version: { license: "MIT OR Apache-2.0" } }` for the exact version.
 */
interface CratesResponse {
  version?: {
    license?: string | null;
  };
}

export class CratesRegistryClient {
  private readonly fetchFn: RegistryFetch;
  private readonly cacheDir: string;
  private readonly ttlMs: number;
  private readonly disabled: boolean;
  private readonly skipDisk: boolean;
  private readonly inMemory = new Map<string, string | null>();

  constructor(options: CratesRegistryOptions = {}) {
    this.fetchFn = options.fetch ?? fetch;
    this.cacheDir = options.cacheDir ?? defaultCacheDir();
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.disabled = options.disabled ?? false;
    this.skipDisk = shouldSkipDiskCache(options.cacheDir !== undefined);
  }

  async getLicense(name: string, version: string): Promise<string | null> {
    if (this.disabled) return null;
    if (!name || !version || version === '0.0.0') return null;

    const memKey = `${name}@${version}`;
    if (this.inMemory.has(memKey)) return this.inMemory.get(memKey) ?? null;

    const cacheFile = path.join(this.cacheDir, sanitizeKey(name, version));
    const cached = await this.readCache(cacheFile);
    if (cached) {
      this.inMemory.set(memKey, cached.license);
      return cached.license;
    }

    const { entry, license } = await this.fetchFromRegistry(name, version);
    if (entry) await this.writeCache(cacheFile, entry);
    this.inMemory.set(memKey, license);
    return license;
  }

  private async readCache(cacheFile: string): Promise<CacheEntry | null> {
    if (this.skipDisk) return null;
    try {
      const raw = await readFile(cacheFile, 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry;
      const age = Date.now() - new Date(entry.fetchedAt).getTime();
      const ttl = entry.status === 'not-found' ? NEGATIVE_TTL_MS : this.ttlMs;
      if (age > ttl) return null;
      return entry;
    } catch {
      return null;
    }
  }

  private async writeCache(cacheFile: string, entry: CacheEntry): Promise<void> {
    if (this.skipDisk) return;
    try {
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, JSON.stringify(entry), 'utf-8');
    } catch {
      // Best-effort.
    }
  }

  private async fetchFromRegistry(
    name: string,
    version: string,
  ): Promise<{ entry: CacheEntry | null; license: string | null }> {
    const url = `https://crates.io/api/v1/crates/${encodeURIComponent(
      name,
    )}/${encodeURIComponent(version)}`;

    try {
      const res = await this.fetchFn(url);
      if (res.status === 404) {
        return {
          entry: {
            fetchedAt: new Date().toISOString(),
            status: 'not-found',
            license: null,
          },
          license: null,
        };
      }
      if (!res.ok) {
        return { entry: null, license: null };
      }
      const data = (await res.json()) as CratesResponse;
      const license = data?.version?.license ?? null;
      return {
        entry: {
          fetchedAt: new Date().toISOString(),
          status: 'ok',
          license,
        },
        license,
      };
    } catch {
      return { entry: null, license: null };
    }
  }
}
