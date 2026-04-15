import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA_VERSION = 1;

export function getDbPath(): string {
  const localDir = join(process.cwd(), '.velocity');
  const globalDir = join(homedir(), '.velocity-mcp');
  // Prefer project-local DB if .velocity/ directory exists
  const dir = existsSync(localDir) ? localDir : globalDir;
  mkdirSync(dir, { recursive: true });
  return join(dir, 'velocity.db');
}

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
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
    CREATE INDEX IF NOT EXISTS idx_tasks_started_at ON tasks(started_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
  `);

  const existing = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
  if (!existing) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('first_run_date', new Date().toISOString());
  }

  return db;
}
