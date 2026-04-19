import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type RegistryFetch = typeof fetch;

export interface PyPIRegistryOptions {
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
    return path.join(process.env['VOW_REGISTRY_CACHE_DIR']!, 'pypi');
  }
  return path.join(os.homedir(), '.cache', 'vow', 'registry', 'pypi');
}

function shouldSkipDiskCache(explicitCacheDir: boolean): boolean {
  if (explicitCacheDir) return false;
  return !!process.env['VITEST'] && !process.env['VOW_REGISTRY_CACHE_DIR'];
}

function sanitizeKey(name: string, version: string): string {
  const safe = `${name}@${version}`.replace(/[^\w.@+-]/g, '_');
  return `${safe}.json`;
}

interface PyPIResponse {
  info?: {
    license?: string | null;
    classifiers?: string[];
  };
}

// Map common PyPI classifier suffixes to SPDX IDs. The classifier string is
// like "License :: OSI Approved :: MIT License" — we split on " :: " and
// take the final segment.
const CLASSIFIER_TO_SPDX: Record<string, string> = {
  'MIT License': 'MIT',
  'Apache Software License': 'Apache-2.0',
  'BSD License': 'BSD-3-Clause',
  'ISC License (ISCL)': 'ISC',
  'ISC License': 'ISC',
  'Mozilla Public License 2.0 (MPL 2.0)': 'MPL-2.0',
  'GNU General Public License v2 (GPLv2)': 'GPL-2.0-only',
  'GNU General Public License v3 (GPLv3)': 'GPL-3.0-only',
  'GNU Lesser General Public License v2 (LGPLv2)': 'LGPL-2.0-only',
  'GNU Lesser General Public License v3 (LGPLv3)': 'LGPL-3.0-only',
  'GNU Affero General Public License v3': 'AGPL-3.0-only',
  'Public Domain': 'CC0-1.0',
  'The Unlicense (Unlicense)': 'Unlicense',
  'Zlib/Libpng License': 'Zlib',
};

export function extractLicenseFromPyPI(info: PyPIResponse['info']): string | null {
  if (!info) return null;

  if (typeof info.license === 'string' && info.license.trim().length > 0) {
    // Some packages put the full license text here. Keep short strings
    // (likely SPDX-ish) and punt long blobs back to the classifier list.
    const trimmed = info.license.trim();
    if (trimmed.length < 200) return trimmed;
  }

  if (Array.isArray(info.classifiers)) {
    for (const classifier of info.classifiers) {
      if (!classifier.startsWith('License ::')) continue;
      const parts = classifier.split(' :: ');
      const tail = parts[parts.length - 1]!;
      const mapped = CLASSIFIER_TO_SPDX[tail];
      if (mapped) return mapped;
    }
  }

  return null;
}

export class PyPIRegistryClient {
  private readonly fetchFn: RegistryFetch;
  private readonly cacheDir: string;
  private readonly ttlMs: number;
  private readonly disabled: boolean;
  private readonly skipDisk: boolean;
  private readonly inMemory = new Map<string, string | null>();

  constructor(options: PyPIRegistryOptions = {}) {
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
    const url = `https://pypi.org/pypi/${encodeURIComponent(
      name,
    )}/${encodeURIComponent(version)}/json`;

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
      const data = (await res.json()) as PyPIResponse;
      const license = extractLicenseFromPyPI(data.info);
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
