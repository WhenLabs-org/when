import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import {
  backfillEmbeddings,
  BACKFILL_BATCH_LIMIT,
  bufferToVector,
  cosineSimilarity,
  taskEmbeddingText,
  tryEmbed,
  vectorToBuffer,
  type Embedder,
} from '../matching/embedding.js';
import { computeSimilarity, descriptionLengthRatio } from '../matching/similarity.js';
import type { Task } from '../types.js';

// Deterministic lightweight stub: hashes the text to a 384-vector. Two texts
// sharing tokens share vector components. Enough signal for the computeSimilarity
// test without needing a 25 MB transformer.
function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stubEmbed(text: string): Float32Array {
  const vec = new Float32Array(384);
  for (const tok of tokens(text)) {
    const h = hashString(tok);
    vec[h % vec.length] += 1;
  }
  // L2 normalize so cosine ≈ dot product.
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

const stubEmbedder: Embedder = {
  modelName: 'test-stub-v1',
  async embed(text: string) { return stubEmbed(text); },
};

let db: Database.Database;
let queries: TaskQueries;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'velocity-emb-'));
  db = initDb(join(dir, 'test.db'));
  queries = new TaskQueries(db);
});

afterEach(() => {
  db.close();
});

describe('cosineSimilarity', () => {
  it('identical unit vectors → 1', () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it('orthogonal → 0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 6);
  });

  it('opposite → -1', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 6);
  });

  it('dimension mismatch → 0', () => {
    expect(cosineSimilarity(new Float32Array([1, 2]), new Float32Array([1, 2, 3]))).toBe(0);
  });

  it('zero-norm input → 0', () => {
    expect(cosineSimilarity(new Float32Array([0, 0, 0]), new Float32Array([1, 1, 1]))).toBe(0);
  });
});

describe('vectorToBuffer / bufferToVector round-trip', () => {
  it('preserves values exactly', () => {
    const src = new Float32Array([0.1, -0.5, 3.14, 1e-10, -1e10]);
    const buf = vectorToBuffer(src);
    const round = bufferToVector(buf);
    expect(round.length).toBe(src.length);
    for (let i = 0; i < src.length; i++) expect(round[i]).toBeCloseTo(src[i], 6);
  });

  it('round-trip persists through SQLite BLOB column', () => {
    queries.insertTask('t1', 'implement', [], 'x', null, '2026-01-01T00:00:00Z', null);
    const vec = stubEmbed('hello world');
    queries.setEmbedding('t1', vectorToBuffer(vec), 'test-stub-v1');
    const row = queries.getTask('t1')!;
    expect(row.embedding).toBeInstanceOf(Buffer);
    expect(row.embedding_model).toBe('test-stub-v1');
    const round = bufferToVector(row.embedding!);
    expect(cosineSimilarity(vec, round)).toBeCloseTo(1, 5);
  });
});

describe('descriptionLengthRatio', () => {
  it('equal lengths → 1', () => {
    expect(descriptionLengthRatio('abcde', '12345')).toBe(1);
  });
  it('shorter / longer ratio', () => {
    expect(descriptionLengthRatio('abc', 'abcdef')).toBeCloseTo(0.5, 6);
  });
  it('both empty → 1', () => {
    expect(descriptionLengthRatio('', '')).toBe(1);
  });
});

describe('taskEmbeddingText', () => {
  it('joins description with tags', () => {
    expect(taskEmbeddingText('Fix the login bug', ['auth', 'typescript']))
      .toContain('Fix the login bug');
    expect(taskEmbeddingText('Fix', ['auth'])).toContain('auth');
  });
  it('omits tag suffix when no tags', () => {
    expect(taskEmbeddingText('Fix', [])).toBe('Fix');
  });
});

describe('tryEmbed', () => {
  it('returns null for empty text', async () => {
    expect(await tryEmbed(stubEmbedder, '')).toBeNull();
  });
  it('returns null if embedder throws', async () => {
    const bad: Embedder = { modelName: 'bad', async embed() { throw new Error('nope'); } };
    expect(await tryEmbed(bad, 'hello')).toBeNull();
  });
  it('returns the vector on success', async () => {
    const vec = await tryEmbed(stubEmbedder, 'hello world');
    expect(vec).not.toBeNull();
    expect(vec!.length).toBe(384);
  });
});

describe('computeSimilarity with embeddings', () => {
  function taskFixture(overrides: Partial<Task> = {}): Task {
    return {
      id: 'h1', category: 'debug', tags: [],
      description: 'placeholder', project: null,
      started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
      duration_seconds: 300, status: 'completed',
      files_estimated: null, files_actual: null, notes: null,
      lines_added: null, lines_removed: null, files_changed: null, git_diff_stat: null,
      predicted_duration_seconds: null, predicted_p25_seconds: null,
      predicted_p75_seconds: null, predicted_confidence: null,
      model_id: null, context_tokens: null, tools_used: [],
      tool_call_count: null, turn_count: null, first_edit_offset_seconds: null,
      retry_count: null, tests_passed_first_try: null,
      embedding: null, embedding_model: null,
      paused_seconds: null, parent_task_id: null, parent_plan_id: null,
      ...overrides,
    };
  }

  it('semantic match beats lexically-different but semantically-similar pair', () => {
    // Plan: "fix the login bug" with no tag overlap
    const plan = {
      category: 'debug' as const,
      tags: ['auth'],
      description: 'fix the login bug',
      embedding: stubEmbed('fix the login bug auth'),
    };
    // Historical task with totally different tags but overlapping words:
    const overlapping = taskFixture({
      description: 'login bug fix',
      tags: ['unrelated-tag'],
      embedding: vectorToBuffer(stubEmbed('login bug fix unrelated-tag')),
    });
    // Historical task with no shared words:
    const unrelated = taskFixture({
      id: 'h2',
      description: 'refactor database schema',
      tags: ['database'],
      embedding: vectorToBuffer(stubEmbed('refactor database schema database')),
    });

    const overlappingScore = computeSimilarity(plan, overlapping);
    const unrelatedScore = computeSimilarity(plan, unrelated);
    expect(overlappingScore).toBeGreaterThan(unrelatedScore);
    expect(overlappingScore).toBeGreaterThan(0.3);
  });

  it('falls back to Jaccard when embeddings are missing', () => {
    const plan = {
      category: 'debug' as const,
      tags: ['auth', 'typescript'],
      description: 'fix login',
    };
    // No embeddings on either side — classical Jaccard path.
    const a = taskFixture({ tags: ['auth', 'typescript'], description: 'x' });
    const b = taskFixture({ id: 'h2', tags: ['database'], description: 'y' });
    expect(computeSimilarity(plan, a)).toBeGreaterThan(computeSimilarity(plan, b));
  });

  it('returns 0 for category mismatch even with matching embeddings', () => {
    const plan = {
      category: 'debug' as const,
      description: 'login bug',
      embedding: stubEmbed('login bug'),
    };
    const t = taskFixture({ category: 'refactor', embedding: vectorToBuffer(stubEmbed('login bug')) });
    expect(computeSimilarity(plan, t)).toBe(0);
  });
});

describe('backfillEmbeddings', () => {
  it('embeds and stores up to limit; subsequent run processes the rest', async () => {
    // Seed 3 completed tasks without embeddings.
    for (let i = 0; i < 3; i++) {
      const id = `t${i}`;
      queries.insertTask(id, 'implement', ['tag' + i], `task ${i}`, null, `2026-01-0${i + 1}T00:00:00Z`, null);
      queries.endTask(id, `2026-01-0${i + 1}T00:05:00Z`, 300, 'completed', null, null);
    }
    expect(queries.countTasksMissingEmbedding()).toBe(3);

    const r1 = await backfillEmbeddings(queries, stubEmbedder, 2);
    expect(r1.attempted).toBe(2);
    expect(r1.succeeded).toBe(2);
    expect(queries.countTasksMissingEmbedding()).toBe(1);

    const r2 = await backfillEmbeddings(queries, stubEmbedder, 10);
    expect(r2.succeeded).toBe(1);
    expect(queries.countTasksMissingEmbedding()).toBe(0);
  });

  it('records failures when the embedder throws', async () => {
    const broken: Embedder = { modelName: 'x', async embed() { throw new Error('boom'); } };
    queries.insertTask('t1', 'implement', [], 'task', null, '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', null, null);
    const r = await backfillEmbeddings(queries, broken, 10);
    expect(r.failed).toBe(1);
    expect(queries.countTasksMissingEmbedding()).toBe(1);
  });

  it('noops when nothing needs embedding', async () => {
    const r = await backfillEmbeddings(queries, stubEmbedder, BACKFILL_BATCH_LIMIT);
    expect(r.attempted).toBe(0);
  });
});
