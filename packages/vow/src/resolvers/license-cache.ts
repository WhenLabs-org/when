import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { LicenseResult } from '../types.js';

export interface LicenseCacheOptions {
  cacheDir?: string;
  ttlMs?: number;
  disabled?: boolean;
}

interface CacheEntry {
  fetchedAt: string;
  ecosystem: string;
  name: string;
  version: string;
  license: LicenseResult;
}

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function defaultCacheDir(): string {
  if (process.env['VOW_LICENSE_CACHE_DIR']) {
    return process.env['VOW_LICENSE_CACHE_DIR']!;
  }
  if (process.env['XDG_CACHE_HOME']) {
    return path.join(process.env['XDG_CACHE_HOME']!, 'vow', 'licenses');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'vow', 'licenses');
  }
  return path.join(os.homedir(), '.cache', 'vow', 'licenses');
}

function defaultDisabled(): boolean {
  // Auto-disable inside vitest so test A doesn't leak resolutions to test B
  // via the shared user cache. Callers can still opt in by passing
  // { disabled: false } or setting VOW_LICENSE_CACHE_DIR.
  return !!process.env['VITEST'] && !process.env['VOW_LICENSE_CACHE_DIR'];
}

function sanitize(s: string): string {
  return s.replace(/[^\w.@+-]/g, '_');
}

function cacheKey(name: string, version: string): string {
  // Collapse long names (scoped, deeply-qualified) into a short hash-suffixed
  // path to stay under filesystem limits (e.g. eCryptfs' 143-byte filename
  // limit). Keeps a readable prefix for debugging.
  const readable = `${sanitize(name)}@${sanitize(version)}`;
  if (readable.length <= 80) return readable;
  const hash = createHash('sha1').update(`${name}@${version}`).digest('hex').slice(0, 12);
  return `${readable.slice(0, 60)}-${hash}`;
}

/**
 * Disk-backed cache keyed by (ecosystem, name, version). Built on the
 * assumption that a published package@version is immutable — true for
 * npm, crates.io, and PyPI. Hits skip readdir + readFile + TF-IDF.
 *
 * Only successful resolutions (source !== 'none') are cached; a failed
 * resolution can later succeed (e.g. once registry fallback is enabled),
 * so caching null would be sticky and wrong.
 */
export class LicenseCache {
  private readonly cacheDir: string;
  private readonly ttlMs: number;
  private readonly disabled: boolean;
  private readonly inMemory = new Map<string, LicenseResult>();

  constructor(options: LicenseCacheOptions = {}) {
    this.cacheDir = options.cacheDir ?? defaultCacheDir();
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.disabled = options.disabled ?? defaultDisabled();
  }

  private memKey(ecosystem: string, name: string, version: string): string {
    return `${ecosystem}:${name}@${version}`;
  }

  private filePath(ecosystem: string, name: string, version: string): string {
    return path.join(this.cacheDir, sanitize(ecosystem), `${cacheKey(name, version)}.json`);
  }

  async get(
    ecosystem: string,
    name: string,
    version: string,
  ): Promise<LicenseResult | null> {
    if (this.disabled) return null;
    if (!name || !version || version === '0.0.0') return null;

    const mk = this.memKey(ecosystem, name, version);
    const mem = this.inMemory.get(mk);
    if (mem) return mem;

    try {
      const raw = await readFile(this.filePath(ecosystem, name, version), 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry;
      const age = Date.now() - new Date(entry.fetchedAt).getTime();
      if (age > this.ttlMs) return null;
      this.inMemory.set(mk, entry.license);
      return entry.license;
    } catch {
      return null;
    }
  }

  async set(
    ecosystem: string,
    name: string,
    version: string,
    license: LicenseResult,
  ): Promise<void> {
    if (this.disabled) return;
    if (!name || !version || version === '0.0.0') return;
    if (license.source === 'none') return; // never cache failures

    const mk = this.memKey(ecosystem, name, version);
    this.inMemory.set(mk, license);

    const entry: CacheEntry = {
      fetchedAt: new Date().toISOString(),
      ecosystem,
      name,
      version,
      license,
    };
    const file = this.filePath(ecosystem, name, version);
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(entry), 'utf-8');
    } catch {
      // best-effort
    }
  }
}
