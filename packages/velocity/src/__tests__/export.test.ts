import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import {
  applyImport,
  buildExport,
  EXPORT_FORMAT_VERSION,
} from '../cli/export.js';
import { vectorToBuffer } from '../matching/embedding.js';

let db: Database.Database;
let queries: TaskQueries;
let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'velocity-export-'));
  db = initDb(join(tmp, 'src.db'));
  queries = new TaskQueries(db);
});

afterEach(() => { db.close(); });

describe('buildExport', () => {
  it('includes tasks, calibration, plan_runs, and meta', () => {
    queries.insertTask('t1', 'implement', ['ts'], 'x', 'p', '2026-01-01T00:00:00Z', 2);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', 2, null);
    queries.setEmbedding('t1', vectorToBuffer(new Float32Array([0.1, 0.2, 0.3])), 'stub');
    queries.upsertCalibration({
      category: 'implement', bucket: 'stub|medium',
      mean_log_error: 0.1, var_log_error: 0.01, n: 5, updated_at: '2026-01-01T00:05:00Z',
    });
    queries.insertPlanRun('p1', '2026-01-01T00:00:00Z', '[]', 'stub', 300);

    const payload = buildExport(queries);
    expect(payload.format_version).toBe(EXPORT_FORMAT_VERSION);
    expect(payload.schema_version).toBeGreaterThan(0);
    expect(payload.tasks).toHaveLength(1);
    expect(payload.calibration).toHaveLength(1);
    expect(payload.plan_runs).toHaveLength(1);
    expect(payload.meta.find(m => m.key === 'schema_version')).toBeDefined();
  });

  it('base64-encodes the embedding so the payload is pure JSON-safe', () => {
    queries.insertTask('t1', 'implement', [], 'x', null, '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', null, null);
    const vec = new Float32Array([1.5, -0.5, 2.25]);
    queries.setEmbedding('t1', vectorToBuffer(vec), 'stub');
    const payload = buildExport(queries);
    const t = payload.tasks[0];
    expect(typeof t.embedding).toBe('string');
    // Round-trippable — same bytes back.
    const back = Buffer.from(t.embedding!, 'base64');
    expect(back.length).toBe(vec.byteLength);
  });
});

describe('applyImport round-trip', () => {
  it('restores an empty DB to exactly match the source', () => {
    queries.insertTask('t1', 'debug', ['auth'], 'original', 'p1', '2026-01-01T00:00:00Z', 3);
    queries.endTask('t1', '2026-01-01T00:10:00Z', 600, 'completed', 3, 'my notes', 50, 10, 3, 'diff text');
    queries.setEmbedding('t1', vectorToBuffer(new Float32Array([0.7, 0.1])), 'stub');
    queries.upsertCalibration({
      category: 'debug', bucket: 'stub|medium',
      mean_log_error: 0.2, var_log_error: 0.05, n: 10, updated_at: null,
    });
    const payload = buildExport(queries);

    // Fresh DB in a separate file.
    const db2 = initDb(join(tmp, 'dst.db'));
    const q2 = new TaskQueries(db2);
    const r = applyImport(q2, payload, /* merge */ false);
    expect(r.tasks).toBe(1);
    expect(r.calibration).toBe(1);

    const t = q2.getTask('t1')!;
    expect(t.category).toBe('debug');
    expect(t.project).toBe('p1');
    expect(t.duration_seconds).toBe(600);
    expect(t.notes).toBe('my notes');
    expect(t.git_diff_stat).toBe('diff text');
    expect(t.embedding).toBeInstanceOf(Buffer);

    const c = q2.getCalibration('debug', 'stub|medium')!;
    expect(c.n).toBe(10);
    db2.close();
  });

  it('skips duplicates when --merge is requested', () => {
    queries.insertTask('t1', 'implement', [], 'x', null, '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', null, null);
    const payload = buildExport(queries);

    const db2 = initDb(join(tmp, 'dst.db'));
    const q2 = new TaskQueries(db2);
    q2.insertTask('t1', 'implement', [], 'preexisting', null, '2026-01-01T00:00:00Z', null);
    q2.endTask('t1', '2026-01-01T00:01:00Z', 60, 'completed', null, null);

    const r = applyImport(q2, payload, true);
    expect(r.tasks).toBe(0);
    expect(r.skipped_tasks).toBe(1);
    expect(q2.getTask('t1')!.description).toBe('preexisting');
    db2.close();
  });

  it('rejects a mismatched format version', () => {
    const payload = buildExport(queries);
    const db2 = initDb(join(tmp, 'dst.db'));
    const q2 = new TaskQueries(db2);
    expect(() => applyImport(q2, { ...payload, format_version: 99 }, false)).toThrow(/format_version/);
    db2.close();
  });
});
