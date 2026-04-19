import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCache, saveCache, type FileFactCacheEntry } from '../../src/utils/cache.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

describe('fact cache', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stale-cache-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns null when no cache exists', async () => {
    const cache = await loadCache(dir, DEFAULT_CONFIG);
    expect(cache).toBeNull();
  });

  it('round-trips entries', async () => {
    const entries = new Map<string, FileFactCacheEntry>([
      ['src/a.ts', {
        mtimeMs: 1000,
        size: 200,
        facts: {
          envVars: [{ name: 'FOO', file: 'src/a.ts', line: 3 }],
          routes: [],
          symbols: ['foo'],
        },
      }],
    ]);
    await saveCache(dir, DEFAULT_CONFIG, entries);
    const loaded = await loadCache(dir, DEFAULT_CONFIG);
    expect(loaded).not.toBeNull();
    expect(loaded!.files['src/a.ts'].facts.envVars[0].name).toBe('FOO');
    expect(loaded!.files['src/a.ts'].facts.symbols).toEqual(['foo']);
  });

  it('invalidates when config changes', async () => {
    await saveCache(dir, DEFAULT_CONFIG, new Map([['a.ts', { mtimeMs: 1, size: 1, facts: { envVars: [], routes: [], symbols: [] } }]]));
    const changedConfig = {
      ...DEFAULT_CONFIG,
      checks: { ...DEFAULT_CONFIG.checks, commands: false },
    };
    const cache = await loadCache(dir, changedConfig);
    expect(cache).toBeNull();
  });
});
