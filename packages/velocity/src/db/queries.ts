import type Database from 'better-sqlite3';
import type {
  TaskRow,
  Category,
  TaskStatus,
  Confidence,
  PlanRunRow,
  CalibrationRow,
} from '../types.js';

export interface PredictionInput {
  predictedDurationSeconds: number;
  predictedP25Seconds: number;
  predictedP75Seconds: number;
  predictedConfidence: Confidence;
}

export interface TelemetryUpdate {
  modelId?: string | null;
  contextTokens?: number | null;
  toolsUsed?: string[] | null;
  toolCallCount?: number | null;
  turnCount?: number | null;
  firstEditOffsetSeconds?: number | null;
  retryCount?: number | null;
  testsPassedFirstTry?: number | null;
  pausedSeconds?: number | null;
  parentTaskId?: string | null;
  parentPlanId?: string | null;
}

export class TaskQueries {
  private stmts;

  constructor(private db: Database.Database) {
    this.stmts = {
      insertTask: db.prepare(`
        INSERT INTO tasks (id, category, tags, description, project, started_at, files_estimated)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      getTask: db.prepare('SELECT * FROM tasks WHERE id = ?'),
      getActiveTask: db.prepare('SELECT * FROM tasks WHERE id = ? AND ended_at IS NULL'),
      endTask: db.prepare(`
        UPDATE tasks SET ended_at = ?, duration_seconds = ?, status = ?, files_actual = ?, notes = ?,
          lines_added = ?, lines_removed = ?, files_changed = ?, git_diff_stat = ?
        WHERE id = ?
      `),
      getCompletedByCategory: db.prepare(`
        SELECT * FROM tasks WHERE category = ? AND status = 'completed' AND duration_seconds IS NOT NULL
        ORDER BY started_at DESC
      `),
      getHistory: db.prepare('SELECT * FROM tasks ORDER BY started_at DESC LIMIT ?'),
      getHistoryByCategory: db.prepare('SELECT * FROM tasks WHERE category = ? ORDER BY started_at DESC LIMIT ?'),
      getHistoryByStatus: db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY started_at DESC LIMIT ?'),
      getHistoryByCategoryAndStatus: db.prepare('SELECT * FROM tasks WHERE category = ? AND status = ? ORDER BY started_at DESC LIMIT ?'),
      getCompletedInRange: db.prepare(`
        SELECT * FROM tasks
        WHERE status = 'completed' AND duration_seconds IS NOT NULL
          AND started_at >= ?
        ORDER BY started_at DESC
      `),
      // v3: prediction + telemetry + plan_runs + calibration
      setPrediction: db.prepare(`
        UPDATE tasks SET predicted_duration_seconds = ?, predicted_p25_seconds = ?,
          predicted_p75_seconds = ?, predicted_confidence = ?
        WHERE id = ?
      `),
      updateTelemetry: db.prepare(`
        UPDATE tasks SET
          model_id = COALESCE(?, model_id),
          context_tokens = COALESCE(?, context_tokens),
          tools_used = COALESCE(?, tools_used),
          tool_call_count = COALESCE(?, tool_call_count),
          turn_count = COALESCE(?, turn_count),
          first_edit_offset_seconds = COALESCE(?, first_edit_offset_seconds),
          retry_count = COALESCE(?, retry_count),
          tests_passed_first_try = COALESCE(?, tests_passed_first_try),
          paused_seconds = COALESCE(?, paused_seconds),
          parent_task_id = COALESCE(?, parent_task_id),
          parent_plan_id = COALESCE(?, parent_plan_id)
        WHERE id = ?
      `),
      setEmbedding: db.prepare(`
        UPDATE tasks SET embedding = ?, embedding_model = ? WHERE id = ?
      `),
      insertPlanRun: db.prepare(`
        INSERT INTO plan_runs (id, created_at, plan_json, model_id, total_predicted_seconds)
        VALUES (?, ?, ?, ?, ?)
      `),
      completePlanRun: db.prepare(`
        UPDATE plan_runs SET total_actual_seconds = ?, completed_at = ? WHERE id = ?
      `),
      getPlanRun: db.prepare('SELECT * FROM plan_runs WHERE id = ?'),
      getRecentPlanRuns: db.prepare(`
        SELECT * FROM plan_runs
        WHERE total_actual_seconds IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ?
      `),
      getCalibration: db.prepare(`
        SELECT * FROM calibration WHERE category = ? AND bucket = ?
      `),
      upsertCalibration: db.prepare(`
        INSERT INTO calibration (category, bucket, mean_log_error, var_log_error, n, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(category, bucket) DO UPDATE SET
          mean_log_error = excluded.mean_log_error,
          var_log_error = excluded.var_log_error,
          n = excluded.n,
          updated_at = excluded.updated_at
      `),
      listCalibration: db.prepare('SELECT * FROM calibration ORDER BY category, bucket'),
      getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
      setMeta: db.prepare(`
        INSERT INTO meta (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `),
      deleteMeta: db.prepare('DELETE FROM meta WHERE key = ?'),
      findOrphans: db.prepare(`
        SELECT id, started_at FROM tasks
        WHERE ended_at IS NULL AND started_at < ?
      `),
      markAbandoned: db.prepare(`
        UPDATE tasks
        SET ended_at = ?, duration_seconds = ?, status = 'abandoned',
            notes = COALESCE(notes, '') || ?
        WHERE id = ? AND ended_at IS NULL
      `),
      countTasksMissingEmbedding: db.prepare(`
        SELECT COUNT(*) AS n FROM tasks
        WHERE status = 'completed' AND embedding IS NULL AND description IS NOT NULL
      `),
      getTasksMissingEmbedding: db.prepare(`
        SELECT * FROM tasks
        WHERE status = 'completed' AND embedding IS NULL AND description IS NOT NULL
        ORDER BY started_at DESC
        LIMIT ?
      `),
      getRecentEmbeddedTasks: db.prepare(`
        SELECT * FROM tasks
        WHERE status = 'completed' AND embedding IS NOT NULL
        ORDER BY started_at DESC
        LIMIT ?
      `),
      planSiblingSummary: db.prepare(`
        SELECT
          COUNT(*)                                              AS total,
          SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END)     AS active,
          COALESCE(SUM(duration_seconds), 0)                    AS total_duration
        FROM tasks
        WHERE parent_plan_id = ?
      `),
      getTasksSince: db.prepare(`
        SELECT * FROM tasks
        WHERE started_at >= ?
        ORDER BY started_at DESC
      `),
      getTasksSinceForProject: db.prepare(`
        SELECT * FROM tasks
        WHERE started_at >= ? AND project = ?
        ORDER BY started_at DESC
      `),
    };
  }

  insertTask(
    id: string,
    category: Category,
    tags: string[],
    description: string,
    project: string | null,
    startedAt: string,
    filesEstimated: number | null,
  ): void {
    this.stmts.insertTask.run(id, category, JSON.stringify(tags), description, project, startedAt, filesEstimated);
  }

  getTask(id: string): TaskRow | undefined {
    return this.stmts.getTask.get(id) as TaskRow | undefined;
  }

  getActiveTask(id: string): TaskRow | undefined {
    return this.stmts.getActiveTask.get(id) as TaskRow | undefined;
  }

  endTask(
    id: string,
    endedAt: string,
    durationSeconds: number,
    status: TaskStatus,
    filesActual: number | null,
    notes: string | null,
    linesAdded: number | null = null,
    linesRemoved: number | null = null,
    filesChanged: number | null = null,
    gitDiffStat: string | null = null,
  ): void {
    this.stmts.endTask.run(endedAt, durationSeconds, status, filesActual, notes, linesAdded, linesRemoved, filesChanged, gitDiffStat, id);
  }

  getCompletedByCategory(category: Category): TaskRow[] {
    return this.stmts.getCompletedByCategory.all(category) as TaskRow[];
  }

  getHistory(limit: number, filterCategory?: Category, filterStatus?: TaskStatus): TaskRow[] {
    if (filterCategory && filterStatus) {
      return this.stmts.getHistoryByCategoryAndStatus.all(filterCategory, filterStatus, limit) as TaskRow[];
    }
    if (filterCategory) {
      return this.stmts.getHistoryByCategory.all(filterCategory, limit) as TaskRow[];
    }
    if (filterStatus) {
      return this.stmts.getHistoryByStatus.all(filterStatus, limit) as TaskRow[];
    }
    return this.stmts.getHistory.all(limit) as TaskRow[];
  }

  getCompletedInRange(sinceIso: string): TaskRow[] {
    return this.stmts.getCompletedInRange.all(sinceIso) as TaskRow[];
  }

  // v3 additions -------------------------------------------------------------

  setPrediction(id: string, p: PredictionInput): void {
    this.stmts.setPrediction.run(
      p.predictedDurationSeconds,
      p.predictedP25Seconds,
      p.predictedP75Seconds,
      p.predictedConfidence,
      id,
    );
  }

  updateTelemetry(id: string, t: TelemetryUpdate): void {
    this.stmts.updateTelemetry.run(
      t.modelId ?? null,
      t.contextTokens ?? null,
      t.toolsUsed != null ? JSON.stringify(t.toolsUsed) : null,
      t.toolCallCount ?? null,
      t.turnCount ?? null,
      t.firstEditOffsetSeconds ?? null,
      t.retryCount ?? null,
      t.testsPassedFirstTry ?? null,
      t.pausedSeconds ?? null,
      t.parentTaskId ?? null,
      t.parentPlanId ?? null,
      id,
    );
  }

  setEmbedding(id: string, embedding: Buffer, modelName: string): void {
    this.stmts.setEmbedding.run(embedding, modelName, id);
  }

  insertPlanRun(
    id: string,
    createdAt: string,
    planJson: string,
    modelId: string | null,
    totalPredictedSeconds: number | null,
  ): void {
    this.stmts.insertPlanRun.run(id, createdAt, planJson, modelId, totalPredictedSeconds);
  }

  completePlanRun(id: string, totalActualSeconds: number, completedAt: string): void {
    this.stmts.completePlanRun.run(totalActualSeconds, completedAt, id);
  }

  getPlanRun(id: string): PlanRunRow | undefined {
    return this.stmts.getPlanRun.get(id) as PlanRunRow | undefined;
  }

  getRecentPlanRuns(limit: number): PlanRunRow[] {
    return this.stmts.getRecentPlanRuns.all(limit) as PlanRunRow[];
  }

  getCalibration(category: string, bucket: string): CalibrationRow | undefined {
    return this.stmts.getCalibration.get(category, bucket) as CalibrationRow | undefined;
  }

  upsertCalibration(row: CalibrationRow): void {
    this.stmts.upsertCalibration.run(
      row.category,
      row.bucket,
      row.mean_log_error,
      row.var_log_error,
      row.n,
      row.updated_at ?? new Date().toISOString(),
    );
  }

  listCalibration(): CalibrationRow[] {
    return this.stmts.listCalibration.all() as CalibrationRow[];
  }

  // --- meta key/value (session state, etc.) --------------------------------

  getMeta(key: string): string | undefined {
    const row = this.stmts.getMeta.get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.stmts.setMeta.run(key, value);
  }

  deleteMeta(key: string): void {
    this.stmts.deleteMeta.run(key);
  }

  // --- orphan sweep: tasks that started long ago and never ended -----------

  reapOrphans(olderThanIso: string, reapedAtIso: string, reason: string): number {
    const orphans = this.stmts.findOrphans.all(olderThanIso) as { id: string; started_at: string }[];
    if (orphans.length === 0) return 0;
    const mark = this.stmts.markAbandoned;
    const reapedAtMs = new Date(reapedAtIso).getTime();
    const note = `\n[velocity] ${reason}`;
    for (const o of orphans) {
      const duration = Math.max(0, (reapedAtMs - new Date(o.started_at).getTime()) / 1000);
      mark.run(reapedAtIso, duration, note, o.id);
    }
    return orphans.length;
  }

  countTasksMissingEmbedding(): number {
    const row = this.stmts.countTasksMissingEmbedding.get() as { n: number };
    return row.n;
  }

  getTasksMissingEmbedding(limit: number): TaskRow[] {
    return this.stmts.getTasksMissingEmbedding.all(limit) as TaskRow[];
  }

  /** Recent completed tasks that already have an embedding — used by the
   *  cross-category classifier to vote on a new task's likely category. */
  getRecentEmbeddedTasks(limit: number): TaskRow[] {
    return this.stmts.getRecentEmbeddedTasks.all(limit) as TaskRow[];
  }

  /** Every task row (no filter). Used by `velocity-mcp export`. */
  getAllTasks(): TaskRow[] {
    return this.db.prepare('SELECT * FROM tasks ORDER BY started_at ASC').all() as TaskRow[];
  }

  /** Every plan_run row. Used by `velocity-mcp export`. */
  getAllPlanRuns(): PlanRunRow[] {
    return this.db.prepare('SELECT * FROM plan_runs ORDER BY created_at ASC').all() as PlanRunRow[];
  }

  /** All meta rows (schema_version etc.). Used by `velocity-mcp export`. */
  getAllMeta(): Array<{ key: string; value: string }> {
    return this.db.prepare('SELECT key, value FROM meta ORDER BY key').all() as Array<{ key: string; value: string }>;
  }

  /** Raw insert of a task row — used only by `velocity-mcp import`. Requires
   *  all existing columns; nulls the rest. Throws on PK collision. */
  insertRawTask(row: TaskRow): void {
    const cols = [
      'id', 'category', 'tags', 'description', 'project', 'started_at', 'ended_at',
      'duration_seconds', 'status', 'files_estimated', 'files_actual', 'notes',
      'lines_added', 'lines_removed', 'files_changed', 'git_diff_stat',
      'predicted_duration_seconds', 'predicted_p25_seconds', 'predicted_p75_seconds',
      'predicted_confidence', 'model_id', 'context_tokens', 'tools_used',
      'tool_call_count', 'turn_count', 'first_edit_offset_seconds', 'retry_count',
      'tests_passed_first_try', 'embedding', 'embedding_model', 'paused_seconds',
      'parent_task_id', 'parent_plan_id',
    ];
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(c => (row as unknown as Record<string, unknown>)[c] ?? null);
    this.db.prepare(`INSERT INTO tasks (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
  }

  insertRawPlanRun(row: PlanRunRow): void {
    this.db.prepare(
      'INSERT INTO plan_runs (id, created_at, plan_json, model_id, total_predicted_seconds, total_actual_seconds, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(row.id, row.created_at, row.plan_json, row.model_id, row.total_predicted_seconds, row.total_actual_seconds, row.completed_at);
  }

  getPlanSiblingSummary(planId: string): { total: number; active: number; total_duration: number } {
    const row = this.stmts.planSiblingSummary.get(planId) as { total: number; active: number; total_duration: number } | undefined;
    return row ?? { total: 0, active: 0, total_duration: 0 };
  }

  /** All tasks (any status) started on/after the given ISO timestamp, newest first. */
  getTasksSince(sinceIso: string, project?: string | null): TaskRow[] {
    if (project != null) {
      return this.stmts.getTasksSinceForProject.all(sinceIso, project) as TaskRow[];
    }
    return this.stmts.getTasksSince.all(sinceIso) as TaskRow[];
  }
}
