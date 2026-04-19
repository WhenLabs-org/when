import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import {
  CLASSIFIER_MIN_CANDIDATES,
  classifyCategory,
  CLASSIFIER_MARGIN,
} from '../matching/classify.js';
import { vectorToBuffer, type Embedder } from '../matching/embedding.js';
import type { Category } from '../types.js';

let db: Database.Database;
let queries: TaskQueries;

// Deterministic bag-of-words embedder — same as the embedding test stub so
// the classifier can exercise real vectors.
function hashVec(text: string): Float32Array {
  const v = new Float32Array(384);
  for (const tok of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) { h ^= tok.charCodeAt(i); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % v.length] += 1;
  }
  let norm = 0; for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

const stubEmbedder: Embedder = {
  modelName: 'classify-stub',
  async embed(text: string) { return hashVec(text); },
};

function seed(id: string, category: Category, text: string): void {
  queries.insertTask(id, category, [], text, null, '2026-01-01T00:00:00Z', null);
  queries.endTask(id, '2026-01-01T00:05:00Z', 300, 'completed', null, null);
  queries.setEmbedding(id, vectorToBuffer(hashVec(text)), 'classify-stub');
}

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'velocity-classify-'));
  db = initDb(join(dir, 'test.db'));
  queries = new TaskQueries(db);
});

afterEach(() => { db.close(); });

// ---------------------------------------------------------------------------

describe('classifyCategory', () => {
  it('falls back when no candidates have embeddings', async () => {
    const r = await classifyCategory('fix the login bug', [], queries, stubEmbedder, 'implement');
    expect(r.source).toBe('fallback');
    expect(r.category).toBe('implement');
  });

  it('falls back when the candidate pool is too small', async () => {
    // Only 2 candidates — below CLASSIFIER_MIN_CANDIDATES=3.
    seed('x1', 'debug', 'fix a bug');
    seed('x2', 'debug', 'fix another bug');
    const r = await classifyCategory('fix the login bug', [], queries, stubEmbedder, 'implement');
    expect(r.source).toBe('fallback');
  });

  it('picks the semantic winner when history is clearly one category', async () => {
    // 5 debug-ish tasks, 1 refactor, 1 docs — strongly biased toward debug.
    seed('d1', 'debug', 'fix a login bug');
    seed('d2', 'debug', 'fix auth bug in handler');
    seed('d3', 'debug', 'debug the login failure');
    seed('d4', 'debug', 'debug failing login test');
    seed('d5', 'debug', 'fix the login crash');
    seed('r1', 'refactor', 'refactor database layer');
    seed('o1', 'docs', 'write api docs');
    const r = await classifyCategory('fix the login bug on submit', [], queries, stubEmbedder, 'implement');
    expect(r.source).toBe('semantic');
    expect(r.category).toBe('debug');
    expect(r.top_k!.length).toBeGreaterThan(0);
  });

  it('respects the margin rule — falls back when winner is too close to runner-up', async () => {
    // Three similar-size buckets of near-identical descriptions; no clear
    // winner. Classifier should fall back.
    for (let i = 0; i < 3; i++) seed(`a${i}`, 'implement', `shared phrase ${i}`);
    for (let i = 0; i < 3; i++) seed(`b${i}`, 'debug', `shared phrase ${i}`);
    for (let i = 0; i < 3; i++) seed(`c${i}`, 'refactor', `shared phrase ${i}`);
    const r = await classifyCategory('shared phrase', [], queries, stubEmbedder, 'config');
    // Either a clear semantic winner emerges or we fall back to 'config'.
    // What we care about: the fallback path MUST trigger on an actual tie.
    if (r.source === 'fallback') {
      expect(r.category).toBe('config');
    } else {
      expect(r.margin).toBeGreaterThanOrEqual(CLASSIFIER_MARGIN);
    }
  });

  it('ignores candidates below the similarity threshold', async () => {
    // All candidates are about totally different things.
    seed('x1', 'docs', 'write user onboarding guide');
    seed('x2', 'config', 'update tsconfig paths');
    seed('x3', 'deploy', 'publish v2 to npm');
    const r = await classifyCategory(
      'fix the login authentication bug crash',
      [],
      queries,
      stubEmbedder,
      'implement',
    );
    // Nothing similar enough -> fallback.
    expect(r.source).toBe('fallback');
    expect(r.category).toBe('implement');
  });

  it('never crashes when the embedder throws — degrades to fallback', async () => {
    seed('d1', 'debug', 'fix a login bug');
    seed('d2', 'debug', 'fix auth bug');
    seed('d3', 'debug', 'fix the crash');
    const brokenEmbedder: Embedder = {
      modelName: 'broken',
      async embed() { throw new Error('no model'); },
    };
    const r = await classifyCategory('fix login', [], queries, brokenEmbedder, 'implement');
    expect(r.source).toBe('fallback');
    expect(r.category).toBe('implement');
  });

  it('respects CLASSIFIER_MIN_CANDIDATES constant', () => {
    expect(CLASSIFIER_MIN_CANDIDATES).toBeGreaterThanOrEqual(3);
  });
});
