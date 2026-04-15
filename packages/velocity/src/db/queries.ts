import type Database from 'better-sqlite3';
import type { TaskRow, Category, TaskStatus } from '../types.js';

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
}
