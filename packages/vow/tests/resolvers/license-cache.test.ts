import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LicenseCache } from '../../src/resolvers/license-cache.js';
import type { LicenseResult } from '../../src/types.js';

const mit: LicenseResult = {
  spdxExpression: 'MIT',
  source: 'package-metadata',
  confidence: 1,
  category: 'permissive',
};

const failure: LicenseResult = {
  spdxExpression: null,
  source: 'none',
  confidence: 0,
  category: 'unknown',
};

describe('LicenseCache', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'vow-lcache-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('round-trips a LicenseResult by (ecosystem, name, version)', async () => {
    const cache = new LicenseCache({ cacheDir, disabled: false });
    await cache.set('npm', 'lodash', '4.17.21', mit);

    const other = new LicenseCache({ cacheDir, disabled: false });
    const result = await other.get('npm', 'lodash', '4.17.21');
    expect(result).toEqual(mit);
  });

  it('isolates different ecosystems', async () => {
    const cache = new LicenseCache({ cacheDir, disabled: false });
    await cache.set('npm', 'serde', '1.0.0', mit);

    expect(await cache.get('cargo', 'serde', '1.0.0')).toBeNull();
    expect(await cache.get('npm', 'serde', '1.0.0')).toEqual(mit);
  });

  it('does not cache failure (source=none) results', async () => {
    const cache = new LicenseCache({ cacheDir, disabled: false });
    await cache.set('npm', 'missing', '1.0.0', failure);

    const other = new LicenseCache({ cacheDir, disabled: false });
    expect(await other.get('npm', 'missing', '1.0.0')).toBeNull();
  });

  it('expires entries past the TTL', async () => {
    const cache = new LicenseCache({ cacheDir, disabled: false, ttlMs: -1 });
    await cache.set('npm', 'lodash', '4.17.21', mit);

    const other = new LicenseCache({ cacheDir, disabled: false, ttlMs: -1 });
    expect(await other.get('npm', 'lodash', '4.17.21')).toBeNull();
  });

  it('returns null for missing entries', async () => {
    const cache = new LicenseCache({ cacheDir, disabled: false });
    expect(await cache.get('npm', 'nope', '1.0.0')).toBeNull();
  });

  it('skips invalid inputs', async () => {
    const cache = new LicenseCache({ cacheDir, disabled: false });
    await cache.set('npm', '', '1.0.0', mit);
    await cache.set('npm', 'a', '', mit);
    await cache.set('npm', 'a', '0.0.0', mit);

    const entries = await readdir(cacheDir).catch(() => [] as string[]);
    expect(entries).toEqual([]);
  });

  it('disabled cache is a no-op', async () => {
    const cache = new LicenseCache({ cacheDir, disabled: true });
    await cache.set('npm', 'lodash', '4.17.21', mit);
    expect(await cache.get('npm', 'lodash', '4.17.21')).toBeNull();
  });

  it('auto-disables when VITEST is set and no cacheDir override', async () => {
    // VITEST is truthy inside this test runner, so the default should be disabled.
    // We deliberately omit cacheDir to exercise the defaulting path.
    const cache = new LicenseCache();
    await cache.set('npm', 'auto-disabled', '1.0.0', mit);
    expect(await cache.get('npm', 'auto-disabled', '1.0.0')).toBeNull();
  });

  it('sanitizes scoped/URL-like characters in the filesystem path', async () => {
    const cache = new LicenseCache({ cacheDir, disabled: false });
    await cache.set('npm', '@scope/name', '1.0.0', mit);
    expect(await cache.get('npm', '@scope/name', '1.0.0')).toEqual(mit);
  });
});
