import { describe, it, expect } from 'vitest';
import { mapRecentSimilar, RECENT_SIMILAR_LIMIT } from '../tools/start-task.js';
import type { SimilarTask, Task } from '../types.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-04-23T12:00:00Z');

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-x',
    category: 'implement',
    tags: ['typescript'],
    description: 'Seed task',
    project: null,
    started_at: new Date(NOW - 2 * DAY).toISOString(),
    ended_at: new Date(NOW - 2 * DAY + 300_000).toISOString(),
    duration_seconds: 300,
    status: 'completed',
    files_estimated: null,
    files_actual: 3,
    notes: null,
    lines_added: null,
    lines_removed: null,
    files_changed: null,
    git_diff_stat: null,
    predicted_duration_seconds: null,
    predicted_p25_seconds: null,
    predicted_p75_seconds: null,
    predicted_confidence: null,
    model_id: null,
    context_tokens: null,
    tools_used: [],
    tool_call_count: null,
    turn_count: null,
    first_edit_offset_seconds: null,
    retry_count: null,
    tests_passed_first_try: null,
    embedding: null,
    embedding_model: null,
    paused_seconds: null,
    parent_task_id: null,
    parent_plan_id: null,
    ...overrides,
  };
}

function makeSimilar(task: Task, similarity = 0.8, weight = 1.0): SimilarTask {
  return { task, similarity, weight };
}

describe('mapRecentSimilar', () => {
  it('returns an empty array for empty input', () => {
    expect(mapRecentSimilar([], NOW)).toEqual([]);
  });

  it('maps a single task to the expected compact shape', () => {
    const task = makeTask({
      id: 't-1',
      description: 'Wire sqlite migration into startup',
      files_actual: 4,
      tests_passed_first_try: 1,
      notes: 'Forgot to run migrations on test fixture — add a setup step next time',
      started_at: new Date(NOW - 1.5 * DAY).toISOString(),
    });

    const out = mapRecentSimilar([makeSimilar(task, 0.734)], NOW);

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      description: 'Wire sqlite migration into startup',
      duration_seconds: 300,
      files_actual: 4,
      tests_passed_first_try: true,
      status: 'completed',
      notes: 'Forgot to run migrations on test fixture — add a setup step next time',
      similarity: 0.734,
      days_ago: 1.5,
    });
  });

  it('maps tests_passed_first_try tri-state: 1 → true, 0 → false, null → null', () => {
    const t = (v: number | null) =>
      mapRecentSimilar(
        [makeSimilar(makeTask({ tests_passed_first_try: v }))],
        NOW,
      )[0].tests_passed_first_try;

    expect(t(1)).toBe(true);
    expect(t(0)).toBe(false);
    expect(t(null)).toBeNull();
  });

  it('includes failed and abandoned tasks alongside completed ones', () => {
    const tasks = [
      makeSimilar(makeTask({ id: 'ok', status: 'completed' })),
      makeSimilar(makeTask({ id: 'broke', status: 'failed' })),
      makeSimilar(makeTask({ id: 'quit', status: 'abandoned' })),
    ];
    const statuses = mapRecentSimilar(tasks, NOW).map(e => e.status);
    expect(statuses).toEqual(['completed', 'failed', 'abandoned']);
  });

  it(`truncates at ${RECENT_SIMILAR_LIMIT} entries`, () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeSimilar(makeTask({ id: `t-${i}`, description: `task ${i}` }), 0.9 - i * 0.05),
    );
    const out = mapRecentSimilar(tasks, NOW);
    expect(out).toHaveLength(RECENT_SIMILAR_LIMIT);
    expect(out.map(e => e.description)).toEqual([
      'task 0', 'task 1', 'task 2', 'task 3', 'task 4',
    ]);
  });

  it('preserves input order (caller is expected to pre-sort by weight desc)', () => {
    const high = makeSimilar(makeTask({ id: 'high', description: 'a' }), 0.95, 1.4);
    const mid  = makeSimilar(makeTask({ id: 'mid',  description: 'b' }), 0.70, 0.7);
    const low  = makeSimilar(makeTask({ id: 'low',  description: 'c' }), 0.35, 0.3);
    const out = mapRecentSimilar([high, mid, low], NOW);
    expect(out.map(e => e.description)).toEqual(['a', 'b', 'c']);
  });

  it('rounds similarity to 3 decimals and days_ago to 1 decimal', () => {
    const out = mapRecentSimilar(
      [makeSimilar(makeTask({
        started_at: new Date(NOW - 0.37 * DAY).toISOString(),
      }), 0.123456)],
      NOW,
    );
    expect(out[0].similarity).toBe(0.123);
    expect(out[0].days_ago).toBe(0.4);
  });
});
