import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NpmRegistryClient } from '../../src/resolvers/registry.js';

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

describe('NpmRegistryClient', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'vow-registry-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('fetches license from registry and returns SPDX string', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ license: 'MIT' }),
    );
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const license = await client.getLicense('left-pad', '1.3.0');

    expect(license).toBe('MIT');
    expect(fetchFn).toHaveBeenCalledOnce();
    const url = fetchFn.mock.calls[0]![0] as string;
    expect(url).toBe('https://registry.npmjs.org/left-pad/1.3.0');
  });

  it('encodes scoped package names with %2F', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ license: 'Apache-2.0' }),
    );
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    await client.getLicense('@scope/pkg', '1.0.0');

    const url = fetchFn.mock.calls[0]![0] as string;
    expect(url).toBe('https://registry.npmjs.org/@scope%2Fpkg/1.0.0');
  });

  it('reuses in-memory cache on repeat calls in the same process', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ license: 'ISC' }),
    );
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    await client.getLicense('a', '1.0.0');
    await client.getLicense('a', '1.0.0');

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('persists results to disk cache across client instances', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ license: 'MIT' }),
    );

    const first = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    await first.getLicense('a', '1.0.0');

    const secondFetch = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ license: 'SHOULD-NOT-BE-CALLED' }),
    );
    const second = new NpmRegistryClient({ fetch: secondFetch as typeof fetch, cacheDir });
    const license = await second.getLicense('a', '1.0.0');

    expect(license).toBe('MIT');
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it('honors TTL — expired entries trigger a refetch', async () => {
    const body = { license: 'MIT' };
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () => stubResponse(body));
    const client = new NpmRegistryClient({
      fetch: fetchFn as typeof fetch,
      cacheDir,
      ttlMs: -1,
    });

    await client.getLicense('a', '1.0.0');
    const second = new NpmRegistryClient({
      fetch: fetchFn as typeof fetch,
      cacheDir,
      ttlMs: -1,
    });
    await second.getLicense('a', '1.0.0');

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('caches 404 negatively and does not refetch within negative TTL', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({}, { status: 404 }),
    );
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const a = await client.getLicense('missing', '1.0.0');
    const secondClient = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    const b = await secondClient.getLicense('missing', '1.0.0');

    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('does not cache transient 5xx errors', async () => {
    let attempt = 0;
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () => {
      attempt++;
      if (attempt === 1) return stubResponse({}, { status: 503 });
      return stubResponse({ license: 'MIT' });
    });
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const first = await client.getLicense('flaky', '1.0.0');
    expect(first).toBeNull();

    const secondClient = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    const second = await secondClient.getLicense('flaky', '1.0.0');
    expect(second).toBe('MIT');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not throw on network errors', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () => {
      throw new Error('ECONNRESET');
    });
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const license = await client.getLicense('a', '1.0.0');
    expect(license).toBeNull();
  });

  it('skips entirely when disabled', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ license: 'MIT' }),
    );
    const client = new NpmRegistryClient({
      fetch: fetchFn as typeof fetch,
      cacheDir,
      disabled: true,
    });

    const license = await client.getLicense('a', '1.0.0');
    expect(license).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('skips invalid inputs without calling fetch', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>();
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    expect(await client.getLicense('', '1.0.0')).toBeNull();
    expect(await client.getLicense('a', '')).toBeNull();
    expect(await client.getLicense('a', '0.0.0')).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('extracts license from deprecated {type} object format', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ license: { type: 'BSD-3-Clause', url: 'http://example.com' } }),
    );
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const license = await client.getLicense('old', '1.0.0');
    expect(license).toBe('BSD-3-Clause');
  });

  it('extracts license from deprecated licenses array format', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ licenses: [{ type: 'Apache-2.0' }] }),
    );
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const license = await client.getLicense('older', '1.0.0');
    expect(license).toBe('Apache-2.0');
  });

  it('writes cache entry as readable JSON', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ license: 'MIT' }),
    );
    const client = new NpmRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    await client.getLicense('a', '1.0.0');

    const file = path.join(cacheDir, 'a@1.0.0.json');
    const content = await readFile(file, 'utf-8');
    const parsed = JSON.parse(content) as { status: string; license: string };
    expect(parsed.status).toBe('ok');
    expect(parsed.license).toBe('MIT');
  });
});
