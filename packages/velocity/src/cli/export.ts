// `velocity-mcp export` / `velocity-mcp import` — a simple backup/restore
// flow for velocity data. Exports tasks (with base64-encoded embeddings),
// calibration rows, plan_runs, and the meta table. Import inserts them into
// a fresh DB (or merges with --merge).

import { readFileSync, writeFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import type { CalibrationRow, PlanRunRow, TaskRow } from '../types.js';

export const EXPORT_FORMAT_VERSION = 1;

interface ExportedTask extends Omit<TaskRow, 'embedding'> {
  embedding: string | null; // base64
}

export interface ExportPayload {
  format_version: number;
  schema_version: number;
  exported_at: string;
  client_version: string;
  meta: Array<{ key: string; value: string }>;
  tasks: ExportedTask[];
  calibration: CalibrationRow[];
  plan_runs: PlanRunRow[];
}

function taskToExport(row: TaskRow): ExportedTask {
  return {
    ...row,
    embedding: row.embedding ? Buffer.from(row.embedding).toString('base64') : null,
  };
}

function exportFromRow(row: ExportedTask): TaskRow {
  return {
    ...row,
    embedding: row.embedding ? Buffer.from(row.embedding, 'base64') : null,
  };
}

export function buildExport(queries: TaskQueries): ExportPayload {
  const meta = queries.getAllMeta();
  const schemaVersionRow = meta.find(m => m.key === 'schema_version');
  return {
    format_version: EXPORT_FORMAT_VERSION,
    schema_version: schemaVersionRow ? Number(schemaVersionRow.value) : 0,
    exported_at: new Date().toISOString(),
    client_version: '0.1.3',
    meta,
    tasks: queries.getAllTasks().map(taskToExport),
    calibration: queries.listCalibration(),
    plan_runs: queries.getAllPlanRuns(),
  };
}

export interface ImportResult {
  tasks: number;
  calibration: number;
  plan_runs: number;
  skipped_tasks: number;
  skipped_plan_runs: number;
}

export function applyImport(queries: TaskQueries, payload: ExportPayload, merge: boolean): ImportResult {
  if (payload.format_version !== EXPORT_FORMAT_VERSION) {
    throw new Error(`unsupported export format_version ${payload.format_version} (expected ${EXPORT_FORMAT_VERSION})`);
  }
  const result: ImportResult = { tasks: 0, calibration: 0, plan_runs: 0, skipped_tasks: 0, skipped_plan_runs: 0 };

  for (const t of payload.tasks) {
    if (merge && queries.getTask(t.id)) { result.skipped_tasks++; continue; }
    queries.insertRawTask(exportFromRow(t));
    result.tasks++;
  }
  for (const c of payload.calibration) {
    queries.upsertCalibration(c);
    result.calibration++;
  }
  for (const p of payload.plan_runs) {
    if (merge && queries.getPlanRun(p.id)) { result.skipped_plan_runs++; continue; }
    queries.insertRawPlanRun(p);
    result.plan_runs++;
  }
  return result;
}

// ---------- CLI entry points ----------

export function runExport(outputPath: string | null, db: Database.Database): void {
  const queries = new TaskQueries(db);
  const payload = buildExport(queries);
  const json = JSON.stringify(payload, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, json + '\n', 'utf-8');
    console.log(`\n✅ Exported ${payload.tasks.length} tasks, ${payload.calibration.length} calibration rows, ${payload.plan_runs.length} plan_runs → ${outputPath}\n`);
  } else {
    process.stdout.write(json + '\n');
  }
}

export function runImport(inputPath: string, merge: boolean, db: Database.Database): void {
  const queries = new TaskQueries(db);

  // Refuse to import into a non-empty DB unless --merge is set.
  const existing = queries.getAllTasks().length;
  if (existing > 0 && !merge) {
    console.error(`\n❌ Database at ${db.name} already has ${existing} tasks.`);
    console.error('   Use --merge to keep existing rows, or delete the DB first.\n');
    process.exit(1);
  }

  const raw = readFileSync(inputPath, 'utf-8');
  let payload: ExportPayload;
  try {
    payload = JSON.parse(raw) as ExportPayload;
  } catch (err) {
    console.error(`\n❌ Could not parse ${inputPath} as JSON: ${(err as Error).message}\n`);
    process.exit(1);
  }

  try {
    const r = applyImport(queries, payload, merge);
    console.log(`\n✅ Imported ${r.tasks} tasks (${r.skipped_tasks} skipped as duplicates), ${r.calibration} calibration rows, ${r.plan_runs} plan_runs (${r.skipped_plan_runs} skipped)\n`);
  } catch (err) {
    console.error(`\n❌ Import failed: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

export function runExportCli(args: string[]): void {
  const i = args.indexOf('--output');
  const outputPath = i >= 0 && args[i + 1] ? args[i + 1] : null;
  const db = initDb();
  try { runExport(outputPath, db); } finally { db.close(); }
}

export function runImportCli(args: string[]): void {
  const merge = args.includes('--merge');
  const positional = args.filter(a => !a.startsWith('--'));
  const inputPath = positional[0];
  if (!inputPath) {
    console.error('Usage: npx velocity-mcp import <file.json> [--merge]');
    process.exit(1);
  }
  const db = initDb();
  try { runImport(inputPath, merge, db); } finally { db.close(); }
}
