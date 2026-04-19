import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { CodeEnvVar, CodeRoute, StaleConfig } from '../types.js';

const CACHE_DIR = '.stale-cache';
const CACHE_FILE = 'facts.json';
const CACHE_VERSION = 2;

export interface FileFactCacheEntry {
  mtimeMs: number;
  size: number;
  facts: {
    envVars: CodeEnvVar[];
    routes: CodeRoute[];
    symbols: string[];
  };
}

export interface FactCache {
  version: number;
  configHash: string;
  files: Record<string, FileFactCacheEntry>;
}

function hashConfig(config: StaleConfig): string {
  const relevant = {
    checks: config.checks,
    ignore: config.ignore,
  };
  return createHash('sha1').update(JSON.stringify(relevant)).digest('hex').slice(0, 16);
}

export async function loadCache(projectPath: string, config: StaleConfig): Promise<FactCache | null> {
  try {
    const raw = await readFile(join(projectPath, CACHE_DIR, CACHE_FILE), 'utf-8');
    const parsed = JSON.parse(raw) as FactCache;
    if (parsed.version !== CACHE_VERSION) return null;
    if (parsed.configHash !== hashConfig(config)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCache(
  projectPath: string,
  config: StaleConfig,
  entries: Map<string, FileFactCacheEntry>,
): Promise<void> {
  const cache: FactCache = {
    version: CACHE_VERSION,
    configHash: hashConfig(config),
    files: {},
  };
  for (const [file, entry] of entries) {
    cache.files[file] = entry;
  }
  try {
    const dir = join(projectPath, CACHE_DIR);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, CACHE_FILE), JSON.stringify(cache), 'utf-8');
  } catch {
    // Cache failures shouldn't break scans
  }
}
