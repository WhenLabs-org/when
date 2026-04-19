import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CratesRegistryClient } from '../../src/resolvers/crates-registry.js';

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

describe('CratesRegistryClient', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'vow-crates-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('fetches license from crates.io /version endpoint', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ version: { license: 'MIT OR Apache-2.0' } }),
    );
    const client = new CratesRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const license = await client.getLicense('serde', '1.0.188');

    expect(license).toBe('MIT OR Apache-2.0');
    expect(fetchFn).toHaveBeenCalledOnce();
    const url = fetchFn.mock.calls[0]![0] as string;
    expect(url).toBe('https://crates.io/api/v1/crates/serde/1.0.188');
  });

  it('caches results across instances', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ version: { license: 'Apache-2.0' } }),
    );

    const first = new CratesRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    await first.getLicense('tokio', '1.32.0');

    const secondFetch = vi.fn<FetchArgs, Promise<Response>>();
    const second = new CratesRegistryClient({ fetch: secondFetch as typeof fetch, cacheDir });
    const license = await second.getLicense('tokio', '1.32.0');

    expect(license).toBe('Apache-2.0');
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it('caches 404 negatively within 1-day TTL', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({}, { status: 404 }),
    );
    const client = new CratesRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const a = await client.getLicense('nope', '1.0.0');
    const other = new CratesRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    const b = await other.getLicense('nope', '1.0.0');

    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('does not cache transient errors', async () => {
    let attempt = 0;
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () => {
      attempt++;
      if (attempt === 1) return stubResponse({}, { status: 500 });
      return stubResponse({ version: { license: 'MIT' } });
    });
    const client = new CratesRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const first = await client.getLicense('flaky', '1.0.0');
    expect(first).toBeNull();

    const other = new CratesRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });
    const second = await other.getLicense('flaky', '1.0.0');
    expect(second).toBe('MIT');
  });

  it('handles missing license field gracefully', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>(async () =>
      stubResponse({ version: {} }),
    );
    const client = new CratesRegistryClient({ fetch: fetchFn as typeof fetch, cacheDir });

    const license = await client.getLicense('bare', '1.0.0');
    expect(license).toBeNull();
  });

  it('skips entirely when disabled', async () => {
    const fetchFn = vi.fn<FetchArgs, Promise<Response>>();
    const client = new CratesRegistryClient({
      fetch: fetchFn as typeof fetch,
      cacheDir,
      disabled: true,
    });

    const license = await client.getLicense('x', '1.0.0');
    expect(license).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
