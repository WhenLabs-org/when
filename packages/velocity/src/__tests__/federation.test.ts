import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import {
  buildUploadPayload,
  clearPriorsCache,
  disableFederation,
  enableFederation,
  fetchPriorsIfEnabled,
  hashTag,
  hashTags,
  loadConfig,
  setTransport,
  UPLOAD_FIELD_WHITELIST,
  uploadIfEnabled,
  type FederationTransport,
  type Priors,
  type UploadPayload,
} from '../federation/client.js';
import { mixWithPrior } from '../federation/mixing.js';
import type { TaskEstimate } from '../matching/similarity.js';

let db: Database.Database;
let queries: TaskQueries;
let tmp: string;

// Redirect the per-user config file into a per-test tempdir so we never
// touch the real ~/.velocity-mcp/federation.json.
let configFile: string;

function pathOverrides(): { cfg: string } {
  return { cfg: configFile };
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'velocity-fed-'));
  configFile = join(tmp, 'federation.json');
  db = initDb(join(tmp, 'test.db'));
  queries = new TaskQueries(db);
  clearPriorsCache();
  setTransport(null); // reset to default, tests install their own below
});

afterEach(() => {
  db.close();
  setTransport(null);
});

// ---------------------------------------------------------------------------

describe('config + salt', () => {
  it('enableFederation creates file with fresh 32-byte salt', () => {
    const cfg = enableFederation('https://example.test', configFile);
    expect(existsSync(configFile)).toBe(true);
    expect(cfg.enabled).toBe(true);
    expect(cfg.endpoint).toBe('https://example.test');
    expect(cfg.salt).toMatch(/^[0-9a-f]{64}$/);
  });

  it('enableFederation after a disable preserves the existing salt', () => {
    const a = enableFederation('https://example.test', configFile);
    disableFederation(configFile);
    const b = enableFederation('https://example.test', configFile);
    expect(b.salt).toBe(a.salt);
    expect(b.enabled).toBe(true);
  });

  it('disableFederation flips enabled to false without touching salt', () => {
    const a = enableFederation('https://example.test', configFile);
    const d = disableFederation(configFile)!;
    expect(d.enabled).toBe(false);
    expect(d.salt).toBe(a.salt);
  });

  it('loadConfig returns null on missing or malformed file', () => {
    expect(loadConfig(configFile)).toBeNull();
    // write something malformed
    require('node:fs').writeFileSync(configFile, 'not json', 'utf-8');
    expect(loadConfig(configFile)).toBeNull();
  });
});

describe('tag hashing', () => {
  it('is deterministic for the same salt', () => {
    const a = hashTag('deadbeef', 'typescript');
    const b = hashTag('deadbeef', 'typescript');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs across salts', () => {
    const a = hashTag('aaaaaa', 'typescript');
    const b = hashTag('bbbbbb', 'typescript');
    expect(a).not.toBe(b);
  });

  it('differs across tags with the same salt', () => {
    const a = hashTag('deadbeef', 'typescript');
    const b = hashTag('deadbeef', 'python');
    expect(a).not.toBe(b);
  });

  it('hashTags maps and preserves order', () => {
    const out = hashTags('deadbeef', ['a', 'b', 'a']);
    expect(out[0]).toBe(out[2]);
    expect(out[0]).not.toBe(out[1]);
  });
});

describe('buildUploadPayload (privacy whitelist)', () => {
  it('returns null for not-yet-completed tasks', () => {
    queries.insertTask('t1', 'implement', ['typescript'], 'secret description', 'super-secret-project', '2026-01-01T00:00:00Z', null);
    const row = queries.getTask('t1')!;
    expect(buildUploadPayload(row, 'salt')).toBeNull();
  });

  it('emits only whitelisted fields — description/notes/project/git never leak', () => {
    queries.insertTask('t1', 'implement', ['typescript', 'api'], 'SECRET description', 'SECRET project', '2026-01-01T00:00:00Z', 3);
    queries.endTask('t1', '2026-01-01T00:10:00Z', 600, 'completed', 4, 'SECRET notes', 120, 30, 5, 'SECRET git diff');
    queries.updateTelemetry('t1', {
      modelId: 'claude-opus-4-7', contextTokens: 250_000,
      testsPassedFirstTry: 1,
    });
    const row = queries.getTask('t1')!;
    const payload = buildUploadPayload(row, 'deadbeef')!;
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain('SECRET description');
    expect(serialized).not.toContain('SECRET notes');
    expect(serialized).not.toContain('SECRET project');
    expect(serialized).not.toContain('SECRET git diff');
    expect(serialized).not.toContain('t1'); // task id never leaves

    const keys = Object.keys(payload).sort();
    const allowed = [...UPLOAD_FIELD_WHITELIST].sort();
    expect(keys).toEqual(allowed);

    expect(payload.category).toBe('implement');
    expect(payload.duration_seconds).toBe(600);
    expect(payload.files_changed).toBe(5);
    expect(payload.lines_added).toBe(120);
    expect(payload.lines_removed).toBe(30);
    expect(payload.model_id).toBe('claude-opus-4-7');
    expect(payload.context_tokens).toBe(250_000);
    expect(payload.tests_passed_first_try).toBe(1);
    expect(payload.tags_hashed).toHaveLength(2);
    payload.tags_hashed.forEach(h => expect(h).toMatch(/^[0-9a-f]{16}$/));
  });

  it('normalises tests_passed_first_try to null when neither 0 nor 1', () => {
    queries.insertTask('t1', 'implement', [], 'd', null, '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', null, null);
    const row = queries.getTask('t1')!;
    const payload = buildUploadPayload(row, 'salt')!;
    expect(payload.tests_passed_first_try).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('uploadIfEnabled + fetchPriorsIfEnabled (mock transport)', () => {
  let uploaded: UploadPayload[];
  let priorsResp: Priors | null;
  let fetchCallCount: number;

  function installMockTransport(): void {
    uploaded = [];
    priorsResp = null;
    fetchCallCount = 0;
    const t: FederationTransport = {
      async upload(_endpoint, payload) { uploaded.push(payload); },
      async fetchPriors(_endpoint, _q) { fetchCallCount++; return priorsResp; },
    };
    setTransport(t);
  }

  it('uploadIfEnabled is a no-op when config is null or disabled', async () => {
    installMockTransport();
    queries.insertTask('t1', 'implement', [], 'd', null, '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', null, null);
    uploadIfEnabled(queries.getTask('t1')!, null);
    // With enabled=false
    uploadIfEnabled(queries.getTask('t1')!, {
      enabled: false, endpoint: 'https://x', salt: 'aa',
    });
    await new Promise(r => setTimeout(r, 10));
    expect(uploaded).toHaveLength(0);
  });

  it('uploads a whitelisted payload when enabled', async () => {
    installMockTransport();
    queries.insertTask('t1', 'implement', ['ts'], 'SECRET', 'proj', '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', null, 'notes');
    uploadIfEnabled(queries.getTask('t1')!, {
      enabled: true, endpoint: 'https://x', salt: 'deadbeef',
    });
    await new Promise(r => setTimeout(r, 10));
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].category).toBe('implement');
    expect(uploaded[0].duration_seconds).toBe(300);
    expect((uploaded[0] as unknown as Record<string, unknown>).description).toBeUndefined();
  });

  it('fetchPriorsIfEnabled returns null when disabled', async () => {
    installMockTransport();
    const out = await fetchPriorsIfEnabled({ category: 'implement', model_id: null }, null);
    expect(out).toBeNull();
    expect(fetchCallCount).toBe(0);
  });

  it('caches priors responses across calls', async () => {
    installMockTransport();
    priorsResp = { n: 100, p25_seconds: 100, median_seconds: 200, p75_seconds: 300 };
    const cfg = { enabled: true, endpoint: 'https://x', salt: 'a' };
    const a = await fetchPriorsIfEnabled({ category: 'implement' }, cfg);
    const b = await fetchPriorsIfEnabled({ category: 'implement' }, cfg);
    expect(a).toEqual(priorsResp);
    expect(b).toEqual(priorsResp);
    expect(fetchCallCount).toBe(1); // second call served from cache
  });

  it('swallows transport errors and caches the null result', async () => {
    setTransport({
      async upload() { /* ignore */ },
      async fetchPriors() { throw new Error('network blown'); },
    });
    const cfg = { enabled: true, endpoint: 'https://x', salt: 'a' };
    const out = await fetchPriorsIfEnabled({ category: 'implement' }, cfg);
    expect(out).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('mixWithPrior', () => {
  const localThin: TaskEstimate = {
    seconds: 100, matchCount: 2, confidence: 'low',
    p25_seconds: 70, median_seconds: 100, p75_seconds: 150,
  };
  const prior: Priors = { n: 500, p25_seconds: 180, median_seconds: 240, p75_seconds: 320 };

  it('pulls the estimate toward the prior when local is thin', () => {
    const m = mixWithPrior(localThin, prior);
    expect(m.federated).toBe(true);
    expect(m.federated_n).toBe(500);
    expect(m.median_seconds).toBeGreaterThan(localThin.median_seconds);
    expect(m.median_seconds).toBeLessThan(prior.median_seconds);
  });

  it('federated weight is large when priors have many more samples', () => {
    const m = mixWithPrior(localThin, prior);
    expect(m.federated_weight).toBeGreaterThan(m.local_weight);
  });

  it('upgrades confidence from low to medium given a large prior n', () => {
    const m = mixWithPrior(localThin, prior);
    expect(m.confidence).toBe('medium');
  });

  it('does not downgrade confidence if local was already high', () => {
    const highLocal: TaskEstimate = { ...localThin, confidence: 'high', matchCount: 12 };
    const m = mixWithPrior(highLocal, prior);
    expect(m.confidence).toBe('high');
  });

  it('always gives local at least ~33% weight', () => {
    const tinyLocal: TaskEstimate = { ...localThin, matchCount: 1 };
    const m = mixWithPrior(tinyLocal, { ...prior, n: 10_000 });
    expect(m.local_weight).toBeGreaterThan(0.33);
  });

  it('preserves p25 < median < p75 ordering', () => {
    const m = mixWithPrior(localThin, prior);
    expect(m.p25_seconds).toBeLessThan(m.median_seconds);
    expect(m.median_seconds).toBeLessThan(m.p75_seconds);
  });
});
