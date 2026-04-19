import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import type { ParsedPolicy } from './types.js';

const CACHE_TTL_DAYS = 30;

export interface PolicyCache {
  get(policyText: string): ParsedPolicy | null;
  set(policyText: string, parsed: ParsedPolicy): void;
  clear(): void;
  getCachePath(): string;
}

export function hashPolicyText(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function getDefaultCacheDir(): string {
  const xdgCache = process.env['XDG_CACHE_HOME'];
  if (xdgCache) {
    return path.join(xdgCache, 'vow');
  }

  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Caches', 'vow');
  }

  return path.join(homedir(), '.cache', 'vow');
}

export function createPolicyCache(cacheDir?: string): PolicyCache {
  const dir = cacheDir ?? getDefaultCacheDir();

  function ensureDir(): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  function getCacheFilePath(policyText: string): string {
    const hash = hashPolicyText(policyText);
    return path.join(dir, `policy-${hash}.json`);
  }

  return {
    get(policyText: string): ParsedPolicy | null {
      const filePath = getCacheFilePath(policyText);

      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content) as ParsedPolicy;

        // Check TTL
        const parsedAt = new Date(parsed.parsedAt);
        const now = new Date();
        const daysDiff = (now.getTime() - parsedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > CACHE_TTL_DAYS) {
          return null;
        }

        return parsed;
      } catch {
        return null;
      }
    },

    set(policyText: string, parsed: ParsedPolicy): void {
      ensureDir();
      const filePath = getCacheFilePath(policyText);
      writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
    },

    clear(): void {
      // Remove all policy-*.json files in cache dir
      if (!existsSync(dir)) return;
      const { readdirSync, unlinkSync } = require('node:fs') as typeof import('node:fs');
      for (const file of readdirSync(dir)) {
        if (file.startsWith('policy-') && file.endsWith('.json')) {
          unlinkSync(path.join(dir, file));
        }
      }
    },

    getCachePath(): string {
      return dir;
    },
  };
}
