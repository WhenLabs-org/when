import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import type Database from 'better-sqlite3';

let db: Database.Database;
let queries: TaskQueries;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'velocity-test-'));
  db = initDb(join(dir, 'test.db'));
  queries = new TaskQueries(db);
});

describe('TaskQueries', () => {
  it('inserts and retrieves a task', () => {
    queries.insertTask('t1', 'implement', ['typescript'], 'Build component', null, '2026-01-01T00:00:00Z', 2);
    const task = queries.getTask('t1');
    expect(task).toBeDefined();
    expect(task!.id).toBe('t1');
    expect(task!.category).toBe('implement');
    expect(JSON.parse(task!.tags)).toEqual(['typescript']);
    expect(task!.description).toBe('Build component');
    expect(task!.files_estimated).toBe(2);
  });

  it('getActiveTask returns task before ending', () => {
    queries.insertTask('t1', 'debug', [], 'Fix bug', null, '2026-01-01T00:00:00Z', null);
    expect(queries.getActiveTask('t1')).toBeDefined();
  });

  it('getActiveTask returns undefined after ending', () => {
    queries.insertTask('t1', 'debug', [], 'Fix bug', null, '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', null, null);
    expect(queries.getActiveTask('t1')).toBeUndefined();
  });

  it('endTask updates all fields', () => {
    queries.insertTask('t1', 'test', [], 'Write tests', 'myproject', '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:03:00Z', 180, 'completed', 3, 'All passed');
    const task = queries.getTask('t1');
    expect(task!.ended_at).toBe('2026-01-01T00:03:00Z');
    expect(task!.duration_seconds).toBe(180);
    expect(task!.status).toBe('completed');
    expect(task!.files_actual).toBe(3);
    expect(task!.notes).toBe('All passed');
  });

  it('getCompletedByCategory returns only completed tasks in category', () => {
    queries.insertTask('t1', 'implement', [], 'Task 1', null, '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', null, null);

    queries.insertTask('t2', 'implement', [], 'Task 2', null, '2026-01-02T00:00:00Z', null);
    queries.endTask('t2', '2026-01-02T00:05:00Z', 300, 'failed', null, null);

    queries.insertTask('t3', 'debug', [], 'Task 3', null, '2026-01-03T00:00:00Z', null);
    queries.endTask('t3', '2026-01-03T00:05:00Z', 300, 'completed', null, null);

    const results = queries.getCompletedByCategory('implement');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('t1');
  });

  it('getHistory respects limit', () => {
    for (let i = 0; i < 5; i++) {
      queries.insertTask(`t${i}`, 'implement', [], `Task ${i}`, null, `2026-01-0${i + 1}T00:00:00Z`, null);
    }
    const results = queries.getHistory(3);
    expect(results).toHaveLength(3);
  });

  it('getHistory filters by category', () => {
    queries.insertTask('t1', 'implement', [], 'Task 1', null, '2026-01-01T00:00:00Z', null);
    queries.insertTask('t2', 'debug', [], 'Task 2', null, '2026-01-02T00:00:00Z', null);
    const results = queries.getHistory(10, 'debug');
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe('debug');
  });

  it('getHistory filters by status', () => {
    queries.insertTask('t1', 'implement', [], 'Task 1', null, '2026-01-01T00:00:00Z', null);
    queries.endTask('t1', '2026-01-01T00:05:00Z', 300, 'completed', null, null);

    queries.insertTask('t2', 'implement', [], 'Task 2', null, '2026-01-02T00:00:00Z', null);
    queries.endTask('t2', '2026-01-02T00:05:00Z', 300, 'failed', null, null);

    const results = queries.getHistory(10, undefined, 'failed');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('t2');
  });

  it('getCompletedInRange respects date boundary', () => {
    queries.insertTask('t1', 'implement', [], 'Old', null, '2025-01-01T00:00:00Z', null);
    queries.endTask('t1', '2025-01-01T00:05:00Z', 300, 'completed', null, null);

    queries.insertTask('t2', 'implement', [], 'New', null, '2026-04-01T00:00:00Z', null);
    queries.endTask('t2', '2026-04-01T00:05:00Z', 300, 'completed', null, null);

    const results = queries.getCompletedInRange('2026-01-01T00:00:00Z');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('t2');
  });
});
