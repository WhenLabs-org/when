import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA_VERSION = 3;

export function getDbPath(): string {
  const localDir = join(process.cwd(), '.velocity');
  const globalDir = join(homedir(), '.velocity-mcp');
  // Prefer project-local DB if .velocity/ directory exists
  const dir = existsSync(localDir) ? localDir : globalDir;
  mkdirSync(dir, { recursive: true });
  return join(dir, 'velocity.db');
}

// Columns added in the v2 -> v3 migration. Kept here so the migration and the
// fresh-DB CREATE TABLE stay in sync.
const V3_TASK_COLUMNS: Array<[string, string]> = [
  ['predicted_duration_seconds', 'REAL'],
  ['predicted_p25_seconds', 'REAL'],
  ['predicted_p75_seconds', 'REAL'],
  ['predicted_confidence', 'TEXT'],
  ['model_id', 'TEXT'],
  ['context_tokens', 'INTEGER'],
  ['tools_used', 'TEXT'],
  ['tool_call_count', 'INTEGER'],
  ['turn_count', 'INTEGER'],
  ['first_edit_offset_seconds', 'REAL'],
  ['retry_count', 'INTEGER'],
  ['tests_passed_first_try', 'INTEGER'],
  ['embedding', 'BLOB'],
  ['embedding_model', 'TEXT'],
  ['paused_seconds', 'REAL DEFAULT 0'],
  ['parent_task_id', 'TEXT'],
  ['parent_plan_id', 'TEXT'],
];

export function initDb(dbPath?: string): Database.Database {
  const path = dbPath ?? getDbPath();
  const db = new Database(path);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
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
      git_diff_stat TEXT,
      predicted_duration_seconds REAL,
      predicted_p25_seconds REAL,
      predicted_p75_seconds REAL,
      predicted_confidence TEXT,
      model_id TEXT,
      context_tokens INTEGER,
      tools_used TEXT,
      tool_call_count INTEGER,
      turn_count INTEGER,
      first_edit_offset_seconds REAL,
      retry_count INTEGER,
      tests_passed_first_try INTEGER,
      embedding BLOB,
      embedding_model TEXT,
      paused_seconds REAL DEFAULT 0,
      parent_task_id TEXT,
      parent_plan_id TEXT
    );

    CREATE TABLE IF NOT EXISTS plan_runs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      model_id TEXT,
      total_predicted_seconds REAL,
      total_actual_seconds REAL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS calibration (
      category TEXT NOT NULL,
      bucket TEXT NOT NULL,
      mean_log_error REAL NOT NULL DEFAULT 0,
      var_log_error REAL NOT NULL DEFAULT 0,
      n INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (category, bucket)
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
    CREATE INDEX IF NOT EXISTS idx_tasks_started_at ON tasks(started_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
    CREATE INDEX IF NOT EXISTS idx_tasks_cat_started ON tasks(category, started_at DESC);
  `);

  const existing = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
  if (!existing) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('first_run_date', new Date().toISOString());
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parent_plan ON tasks(parent_plan_id)');
    return db;
  }

  let currentVersion = Number(existing.value);

  // v1 -> v2: git diff columns
  if (currentVersion < 2) {
    const cols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[];
    const colNames = new Set(cols.map(c => c.name));
    for (const [name, type] of [
      ['lines_added', 'INTEGER'],
      ['lines_removed', 'INTEGER'],
      ['files_changed', 'INTEGER'],
      ['git_diff_stat', 'TEXT'],
    ] as const) {
      if (!colNames.has(name)) {
        db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${type}`);
      }
    }
    currentVersion = 2;
  }

  // v2 -> v3: prediction storage, agent/model telemetry, embeddings, plan linkage,
  // plus plan_runs + calibration tables (already created above via CREATE IF NOT EXISTS).
  if (currentVersion < 3) {
    const cols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[];
    const colNames = new Set(cols.map(c => c.name));
    for (const [name, type] of V3_TASK_COLUMNS) {
      if (!colNames.has(name)) {
        db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${type}`);
      }
    }
    currentVersion = 3;
  }

  if (currentVersion !== Number(existing.value)) {
    db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(String(SCHEMA_VERSION), 'schema_version');
  }

  // Indexes that depend on v3 columns must be created after the migration.
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parent_plan ON tasks(parent_plan_id)');

  return db;
}
