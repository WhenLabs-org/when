import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../src/registry/store.js', () => {
  const dir = { value: '' };
  return {
    __setDir: (d: string) => {
      dir.value = d;
    },
    getRegistryDir: () => dir.value,
    getRegistryPath: () => path.join(dir.value, 'registry.json'),
  };
});

import {
  cached,
  getCachePath,
  invalidateCache,
  readCache,
  writeCache,
} from '../../src/utils/cache.js';
import * as store from '../../src/registry/store.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-cache-'));
  (store as any).__setDir(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('writeCache + readCache', () => {
  it('round-trips a value within TTL', async () => {
    await writeCache('k', { hello: 'world' }, 10_000);
    const hit = await readCache<{ hello: string }>('k');
    expect(hit).toEqual({ hello: 'world' });
  });

  it('returns undefined after TTL expires', async () => {
    const now = Date.now();
    await writeCache('k', 42, 100);
    // Advance virtual clock via readCache's `now` parameter.
    expect(await readCache<number>('k', now + 200)).toBeUndefined();
  });

  it('returns undefined on a miss', async () => {
    expect(await readCache('missing')).toBeUndefined();
  });

  it('returns undefined on a corrupt envelope', async () => {
    await fs.mkdir(path.join(tmpDir, 'cache'), { recursive: true });
    await fs.writeFile(getCachePath('corrupt'), 'not-json', 'utf-8');
    expect(await readCache('corrupt')).toBeUndefined();
  });

  it('sanitises unsafe keys in the filename', () => {
    const p = getCachePath('../../evil / key');
    expect(p).not.toContain('..');
    expect(p).not.toMatch(/ \//);
  });
});

describe('cached()', () => {
  it('calls the producer on first invocation only', async () => {
    const producer = vi.fn(async () => ({ count: 1 }));
    const first = await cached('k2', 1000, producer);
    const second = await cached('k2', 1000, producer);
    expect(first).toEqual({ count: 1 });
    expect(second).toEqual({ count: 1 });
    expect(producer).toHaveBeenCalledTimes(1);
  });
});

describe('invalidateCache', () => {
  it('removes a single key', async () => {
    await writeCache('a', 1, 10_000);
    await writeCache('b', 2, 10_000);
    await invalidateCache('a');
    expect(await readCache('a')).toBeUndefined();
    expect(await readCache('b')).toBe(2);
  });

  it('clears the whole cache when no key is given', async () => {
    await writeCache('a', 1, 10_000);
    await writeCache('b', 2, 10_000);
    await invalidateCache();
    expect(await readCache('a')).toBeUndefined();
    expect(await readCache('b')).toBeUndefined();
  });
});
