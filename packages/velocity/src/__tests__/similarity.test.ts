import { describe, it, expect } from 'vitest';
import {
  jaccardSimilarity,
  fileCountProximity,
  computeSimilarity,
  recencyWeight,
  findSimilarTasks,
  weightedMedian,
  heuristicEstimate,
  estimateTask,
} from '../matching/similarity.js';
import type { Task, PlanItem, SimilarTask } from '../types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-1',
    category: 'implement',
    tags: ['typescript', 'react'],
    description: 'Test task',
    project: null,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_seconds: 300,
    status: 'completed',
    files_estimated: null,
    files_actual: null,
    notes: null,
    ...overrides,
  };
}

describe('jaccardSimilarity', () => {
  it('returns 1 for two empty arrays', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it('returns 0 for no overlap', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns 1 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('returns correct value for partial overlap', () => {
    // intersection: {b}, union: {a, b, c} => 1/3
    expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
  });
});

describe('fileCountProximity', () => {
  it('returns 1 for identical counts', () => {
    expect(fileCountProximity(3, 3)).toBe(1);
  });

  it('returns 0.5 when data is missing', () => {
    expect(fileCountProximity(undefined, 3)).toBe(0.5);
    expect(fileCountProximity(3, null)).toBe(0.5);
  });

  it('returns correct proximity for different counts', () => {
    // |1 - 5| / max(1, 5) = 4/5 = 0.8 => 1 - 0.8 = 0.2
    expect(fileCountProximity(1, 5)).toBeCloseTo(0.2);
  });

  it('returns 1 for both zero', () => {
    expect(fileCountProximity(0, 0)).toBe(1);
  });
});

describe('computeSimilarity', () => {
  it('returns 0 for different categories', () => {
    const plan: PlanItem = { category: 'debug', tags: ['ts'], description: 'test' };
    const task = makeTask({ category: 'implement' });
    expect(computeSimilarity(plan, task)).toBe(0);
  });

  it('returns > 0.3 for same category with matching tags', () => {
    const plan: PlanItem = { category: 'implement', tags: ['typescript', 'react'], description: 'test' };
    const task = makeTask({ category: 'implement', tags: ['typescript', 'react'] });
    expect(computeSimilarity(plan, task)).toBeGreaterThan(0.3);
  });

  it('returns 0.3 base for same category with no tags', () => {
    const plan: PlanItem = { category: 'implement', tags: [], description: 'test' };
    const task = makeTask({ category: 'implement', tags: [] });
    // jaccardSimilarity([], []) = 1, so 1 * 0.7 + 0.3 = 1.0
    expect(computeSimilarity(plan, task)).toBe(1.0);
  });

  it('uses file proximity when both have file data', () => {
    const plan: PlanItem = { category: 'implement', tags: ['ts'], description: 'test', estimated_files: 3 };
    const task = makeTask({ tags: ['ts'], files_actual: 3 });
    const withFiles = computeSimilarity(plan, task);

    const plan2: PlanItem = { category: 'implement', tags: ['ts'], description: 'test', estimated_files: 3 };
    const task2 = makeTask({ tags: ['ts'], files_actual: 10 });
    const withDifferentFiles = computeSimilarity(plan2, task2);

    expect(withFiles).toBeGreaterThan(withDifferentFiles);
  });
});

describe('recencyWeight', () => {
  it('returns 1.5 for recent tasks', () => {
    expect(recencyWeight(new Date().toISOString())).toBe(1.5);
  });

  it('returns 1.0 for old tasks', () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(recencyWeight(oldDate)).toBe(1.0);
  });
});

describe('findSimilarTasks', () => {
  it('filters out tasks below threshold', () => {
    const plan: PlanItem = { category: 'implement', tags: ['python'], description: 'test' };
    const tasks = [
      makeTask({ id: '1', category: 'debug', tags: ['typescript'] }), // wrong category
    ];
    const result = findSimilarTasks(plan, tasks);
    expect(result).toHaveLength(0);
  });

  it('returns matching tasks sorted by weight', () => {
    const plan: PlanItem = { category: 'implement', tags: ['typescript', 'react'], description: 'test' };
    const tasks = [
      makeTask({ id: '1', tags: ['typescript'], duration_seconds: 200 }),
      makeTask({ id: '2', tags: ['typescript', 'react'], duration_seconds: 300 }),
    ];
    const result = findSimilarTasks(plan, tasks);
    expect(result.length).toBeGreaterThan(0);
    // Task with more matching tags should have higher weight
    expect(result[0].task.id).toBe('2');
  });
});

describe('weightedMedian', () => {
  it('returns 0 for empty array', () => {
    expect(weightedMedian([])).toBe(0);
  });

  it('returns the single task duration for one task', () => {
    const tasks: SimilarTask[] = [{
      task: makeTask({ duration_seconds: 250 }),
      similarity: 0.8,
      weight: 0.8,
    }];
    expect(weightedMedian(tasks)).toBe(250);
  });
});

describe('heuristicEstimate', () => {
  it('uses category-specific defaults', () => {
    expect(heuristicEstimate({ category: 'scaffold', description: 'test' })).toBe(120);
    expect(heuristicEstimate({ category: 'debug', description: 'test' })).toBe(300);
  });

  it('multiplies by estimated files', () => {
    expect(heuristicEstimate({ category: 'implement', description: 'test', estimated_files: 3 })).toBe(540);
  });
});

describe('estimateTask', () => {
  it('uses heuristic when no history exists', () => {
    const plan: PlanItem = { category: 'implement', description: 'test' };
    const result = estimateTask(plan, []);
    expect(result.confidence).toBe('none');
    expect(result.matchCount).toBe(0);
    expect(result.seconds).toBe(180); // heuristic default for implement
  });

  it('uses historical data when available', () => {
    const plan: PlanItem = { category: 'implement', tags: ['typescript'], description: 'test' };
    const history = Array.from({ length: 5 }, (_, i) =>
      makeTask({ id: `t-${i}`, tags: ['typescript'], duration_seconds: 200 + i * 10 }),
    );
    const result = estimateTask(plan, history);
    expect(result.confidence).toBe('medium');
    expect(result.matchCount).toBe(5);
    expect(result.seconds).toBeGreaterThan(0);
  });
});
