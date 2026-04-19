import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'velocity-schema-'));
  return join(dir, 'test.db');
}

function columnsOf(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map(r => r.name));
}

function tablesOf(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  return new Set(rows.map(r => r.name));
}

function indexesOf(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
  return new Set(rows.map(r => r.name));
}

describe('schema v3', () => {
  it('fresh DB has all v3 columns, tables, and indexes', () => {
    const db = initDb(tempDbPath());
    const cols = columnsOf(db, 'tasks');
    for (const c of [
      'predicted_duration_seconds', 'predicted_p25_seconds', 'predicted_p75_seconds',
      'predicted_confidence', 'model_id', 'context_tokens', 'tools_used',
      'tool_call_count', 'turn_count', 'first_edit_offset_seconds', 'retry_count',
      'tests_passed_first_try', 'embedding', 'embedding_model', 'paused_seconds',
      'parent_task_id', 'parent_plan_id',
    ]) {
      expect(cols.has(c), `tasks.${c} missing`).toBe(true);
    }
    const tables = tablesOf(db);
    expect(tables.has('plan_runs')).toBe(true);
    expect(tables.has('calibration')).toBe(true);
    const indexes = indexesOf(db);
    expect(indexes.has('idx_tasks_cat_started')).toBe(true);
    expect(indexes.has('idx_tasks_parent_plan')).toBe(true);
    const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    expect(version.value).toBe('3');
    db.close();
  });

  it('migrates a v2 DB forward without losing data', () => {
    const path = tempDbPath();

    // Hand-build a v2 database (matches the old schema from SCHEMA_VERSION = 2).
    const seed = new Database(path);
    seed.pragma('journal_mode = WAL');
    seed.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        description TEXT NOT NULL,
        project TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds REAL,
        status TEXT,
        files_estimated INTEGER,
        files_actual INTEGER,
        notes TEXT,
        lines_added INTEGER,
        lines_removed INTEGER,
        files_changed INTEGER,
        git_diff_stat TEXT
      );
    `);
    seed.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', '2')").run();
    seed.prepare(
      `INSERT INTO tasks (id, category, tags, description, started_at, duration_seconds, status)
       VALUES ('legacy', 'implement', '["ts"]', 'legacy task', '2026-01-01T00:00:00Z', 120, 'completed')`,
    ).run();
    seed.close();

    // Re-open via initDb — should run v2 -> v3 migration.
    const db = initDb(path);
    const cols = columnsOf(db, 'tasks');
    expect(cols.has('predicted_duration_seconds')).toBe(true);
    expect(cols.has('embedding')).toBe(true);
    expect(cols.has('parent_plan_id')).toBe(true);
    expect(tablesOf(db).has('plan_runs')).toBe(true);
    expect(tablesOf(db).has('calibration')).toBe(true);

    const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    expect(version.value).toBe('3');

    const legacy = db.prepare('SELECT id, category, description, duration_seconds FROM tasks WHERE id = ?').get('legacy') as {
      id: string; category: string; description: string; duration_seconds: number;
    };
    expect(legacy.id).toBe('legacy');
    expect(legacy.category).toBe('implement');
    expect(legacy.description).toBe('legacy task');
    expect(legacy.duration_seconds).toBe(120);
    db.close();
  });

  it('is idempotent — calling initDb twice does not error or duplicate columns', () => {
    const path = tempDbPath();
    const db1 = initDb(path);
    db1.close();
    const db2 = initDb(path);
    const cols = columnsOf(db2, 'tasks');
    // Each column should appear exactly once.
    const all = db2.prepare('PRAGMA table_info(tasks)').all() as { name: string }[];
    expect(all.length).toBe(cols.size);
    db2.close();
  });
});

describe('v3 queries', () => {
  it('stores and retrieves predictions', () => {
    const db = initDb(tempDbPath());
    const q = new TaskQueries(db);
    q.insertTask('t1', 'implement', [], 'x', null, '2026-01-01T00:00:00Z', null);
    q.setPrediction('t1', {
      predictedDurationSeconds: 300,
      predictedP25Seconds: 200,
      predictedP75Seconds: 400,
      predictedConfidence: 'medium',
    });
    const row = q.getTask('t1')!;
    expect(row.predicted_duration_seconds).toBe(300);
    expect(row.predicted_p25_seconds).toBe(200);
    expect(row.predicted_p75_seconds).toBe(400);
    expect(row.predicted_confidence).toBe('medium');
    db.close();
  });

  it('updateTelemetry coalesces — partial updates preserve prior fields', () => {
    const db = initDb(tempDbPath());
    const q = new TaskQueries(db);
    q.insertTask('t1', 'implement', [], 'x', null, '2026-01-01T00:00:00Z', null);
    q.updateTelemetry('t1', { modelId: 'claude-opus-4-7', contextTokens: 100_000 });
    q.updateTelemetry('t1', { toolCallCount: 42 });
    const row = q.getTask('t1')!;
    expect(row.model_id).toBe('claude-opus-4-7');
    expect(row.context_tokens).toBe(100_000);
    expect(row.tool_call_count).toBe(42);
  });

  it('plan_runs insert + complete round-trip', () => {
    const db = initDb(tempDbPath());
    const q = new TaskQueries(db);
    q.insertPlanRun('p1', '2026-01-01T00:00:00Z', '[]', 'claude-opus-4-7', 900);
    q.completePlanRun('p1', 1080, '2026-01-01T00:18:00Z');
    const row = q.getPlanRun('p1')!;
    expect(row.total_predicted_seconds).toBe(900);
    expect(row.total_actual_seconds).toBe(1080);
    expect(row.completed_at).toBe('2026-01-01T00:18:00Z');
    const recent = q.getRecentPlanRuns(10);
    expect(recent).toHaveLength(1);
    db.close();
  });

  it('calibration upsert replaces prior row', () => {
    const db = initDb(tempDbPath());
    const q = new TaskQueries(db);
    q.upsertCalibration({
      category: 'debug', bucket: 'claude-opus-4-7|medium',
      mean_log_error: 0.1, var_log_error: 0.05, n: 5, updated_at: null,
    });
    q.upsertCalibration({
      category: 'debug', bucket: 'claude-opus-4-7|medium',
      mean_log_error: 0.2, var_log_error: 0.06, n: 6, updated_at: null,
    });
    const row = q.getCalibration('debug', 'claude-opus-4-7|medium')!;
    expect(row.n).toBe(6);
    expect(row.mean_log_error).toBeCloseTo(0.2);
    db.close();
  });
});
