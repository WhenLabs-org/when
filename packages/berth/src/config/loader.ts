import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseJsonc } from 'jsonc-parser';
import type { BerthConfig, LoadedConfig } from '../types.js';
import { CONFIG_FILE_CANDIDATES, formatForFile } from './schema.js';
import { ConfigValidationError, validateConfig } from './validate.js';

const cache = new Map<string, LoadedConfig | null>();

export function clearConfigCache(): void {
  cache.clear();
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findConfigFile(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  const { root } = path.parse(dir);
  const home = process.env.HOME || process.env.USERPROFILE || '';

  while (true) {
    for (const candidate of CONFIG_FILE_CANDIDATES) {
      const full = path.join(dir, candidate);
      if (await exists(full)) return full;
    }
    // package.json with "berth" field
    const pkgPath = path.join(dir, 'package.json');
    if (await exists(pkgPath)) {
      try {
        const content = await fs.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        if (pkg && typeof pkg === 'object' && 'berth' in pkg) return pkgPath;
      } catch {
        // ignore malformed package.json
      }
    }
    // Stop at .git root or $HOME
    if (await exists(path.join(dir, '.git'))) return null;
    if (dir === home) return null;
    const parent = path.dirname(dir);
    if (parent === dir || parent === root) return null;
    dir = parent;
  }
}

async function readJsonish(filePath: string): Promise<unknown> {
  const content = await fs.readFile(filePath, 'utf-8');
  const errors: import('jsonc-parser').ParseError[] = [];
  const parsed = parseJsonc(content, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new ConfigValidationError(
      `failed to parse ${filePath}: ${errors.map((e) => e.error).join(', ')}`,
      filePath,
    );
  }
  return parsed;
}

async function importModule(filePath: string): Promise<unknown> {
  // On Windows, os.tmpdir() can return an 8.3 short path like
  // C:\Users\RUNNER~1\AppData\Local\Temp, which pathToFileURL encodes to
  // RUNNER%7E1 — vitest's resolver then can't find the file. Resolve the
  // real path first so the file URL points at the long form.
  let resolved = filePath;
  try {
    resolved = await fs.realpath(filePath);
  } catch {
    // fall back to original path
  }
  const url = pathToFileURL(resolved).href;
  const mod = await import(url);
  return (mod as { default?: unknown }).default ?? mod;
}

async function loadFromPath(filePath: string): Promise<LoadedConfig> {
  const base = path.basename(filePath);
  const format = formatForFile(base);

  let raw: unknown;
  if (format === 'package-json') {
    const content = await fs.readFile(filePath, 'utf-8');
    const pkg = JSON.parse(content);
    raw = pkg.berth;
  } else if (format === 'json' || format === 'rc') {
    raw = await readJsonish(filePath);
  } else {
    // js / mjs / cjs
    raw = await importModule(filePath);
  }

  const config = validateConfig(raw, filePath);
  return { config, filePath, format };
}

export async function loadConfig(startDir: string): Promise<LoadedConfig | null> {
  const absDir = path.resolve(startDir);
  if (cache.has(absDir)) return cache.get(absDir) ?? null;

  const filePath = await findConfigFile(absDir);
  if (!filePath) {
    cache.set(absDir, null);
    return null;
  }

  const loaded = await loadFromPath(filePath);

  // Handle `extends` by merging. Loaded config wins over extended.
  if (loaded.config.extends) {
    const extPath = path.resolve(path.dirname(filePath), loaded.config.extends);
    try {
      const base = await loadFromPath(extPath);
      loaded.config = mergeConfig(base.config, loaded.config);
    } catch (err) {
      throw new ConfigValidationError(
        `failed to load extends "${loaded.config.extends}": ${(err as Error).message}`,
        filePath,
      );
    }
  }

  cache.set(absDir, loaded);
  return loaded;
}

export function mergeConfig(base: BerthConfig, override: BerthConfig): BerthConfig {
  return {
    projectName: override.projectName ?? base.projectName,
    ports: { ...base.ports, ...override.ports },
    aliases: { ...base.aliases, ...override.aliases },
    reservedRanges: [...(base.reservedRanges ?? []), ...(override.reservedRanges ?? [])],
    frameworks: {
      disable: [...(base.frameworks?.disable ?? []), ...(override.frameworks?.disable ?? [])],
      override: { ...base.frameworks?.override, ...override.frameworks?.override },
    },
    plugins: [...(base.plugins ?? []), ...(override.plugins ?? [])],
    apiVersion: override.apiVersion ?? base.apiVersion,
  };
}
