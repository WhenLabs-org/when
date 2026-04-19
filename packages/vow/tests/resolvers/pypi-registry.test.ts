import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PyPIRegistryClient, extractLicenseFromPyPI } from '../../src/resolvers/pypi-registry.js';

type FetchArgs = Parameters<typeof fetch>;

function stubResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

describe('extractLicenseFromPyPI', () => {
  it('returns short info.license verbatim', () => {
    expect(extractLicenseFromPyPI({ license: 'MIT' })).toBe('MIT');
    expect(extractLicenseFromPyPI({ license: 'Apache-2.0' })).toBe('Apache-2.0');
  });

  it('falls back to classifiers when license is blank', () => {
    expect(
      extractLicenseFromPyPI({
        license: '',
        classifiers: [
          'Development Status :: 5 - Production/Stable',
          'License :: OSI Approved :: MIT License',
        ],
      }),
    ).toBe('MIT');
  });

  it('falls back to classifiers when info.license is a long blob', () => {
    const bigText = 'A'.repeat(500);
    expect(
      extractLicenseFromPyPI({
        license: bigText,
        classifiers: ['License :: OSI Approved :: Apache Software License'],
      }),
    ).toBe('Apache-2.0');
  });

  it('maps common classifier strings to SPDX', () => {
    const cases: Array<[string, string]> = [
      ['License :: OSI Approved :: MIT License', 'MIT'],
      ['License :: OSI Approved :: BSD License', 'BSD-3-Clause'],
      ['License :: OSI Approved :: ISC License (ISCL)', 'ISC'],
      ['License :: OSI Approved :: GNU General Public License v3 (GPLv3)', 'GPL-3.0-only'],
      ['License :: OSI Approved :: GNU Affero General Public License v3', 'AGPL-3.0-only'],
    ];
    for (const [classifier, expected] of cases) {
      expect(extractLicenseFromPyPI({ classifiers: [classifier] })).toBe(expected);
    }
  });

  it('returns null when no license information is present', () => {
    expect(extractLicenseFromPyPI({})).toBeNull();
    expect(extractLicenseFromPyPI(undefined)).toBeNull();
  });
});

describe('PyPIRegistryClient', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'vow-pypi-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('fetches license via /pypi/{name}/{version}/json', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ info: { license: 'MIT' } }),
    );
    const client = new PyPIRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const license = await client.getLicense('requests', '2.31.0');
    expect(license).toBe('MIT');
    const url = fetchFn.mock.calls[0]![0] as string;
    expect(url).toBe('https://pypi.org/pypi/requests/2.31.0/json');
  });

  it('falls back to classifiers when info.license is empty', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({
        info: {
          license: '',
          classifiers: ['License :: OSI Approved :: Apache Software License'],
        },
      }),
    );
    const client = new PyPIRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    expect(await client.getLicense('pkg', '1.0')).toBe('Apache-2.0');
  });

  it('caches results across instances', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ info: { license: 'BSD-3-Clause' } }),
    );

    const first = new PyPIRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    await first.getLicense('flask', '2.0.0');

    const secondFetch = vi.fn<FetchArgs, Promise<Response>>();
    const second = new PyPIRegistryClient({ fetch: secondFetch as typeof fetch, cacheDir });
    expect(await second.getLicense('flask', '2.0.0')).toBe('BSD-3-Clause');
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it('caches 404 negatively', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({}, { status: 404 }),
    );
    const client = new PyPIRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    expect(await client.getLicense('nope', '1.0')).toBeNull();

    const other = new PyPIRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    expect(await other.getLicense('nope', '1.0')).toBeNull();
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
