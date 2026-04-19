import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import {
  generateReflectInsights,
  ruleCalibrationStatus,
  ruleCategoryTagSlowdown,
  ruleContextTokensImpact,
  ruleFailureCluster,
  ruleModelComparison,
  rulePlanModelStatus,
  ruleRetryHeavyTag,
  ruleTestsFirstTry,
  ruleVelocityTrend,
  tasksInScope,
  windowMsForScope,
} from '../matching/reflect.js';
import type { Category, Task, TaskStatus } from '../types.js';
import { parseTask } from '../types.js';
import { recordResidual } from '../matching/calibration.js';
import { writeParams } from '../matching/plan-model.js';

let db: Database.Database;
let queries: TaskQueries;
const NOW = new Date('2026-04-19T12:00:00Z');

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'velocity-reflect-'));
  db = initDb(join(dir, 'test.db'));
  queries = new TaskQueries(db);
});

afterEach(() => {
  db.close();
});

interface SeedOptions {
  id?: string;
  category?: Category;
  tags?: string[];
  duration?: number;
  status?: TaskStatus;
  startedAgoMs?: number;
  modelId?: string | null;
  contextTokens?: number | null;
  firstEditOffset?: number | null;
  retries?: number | null;
  testsPassedFirstTry?: 0 | 1 | null;
  project?: string | null;
}

let seq = 0;
function seed(opts: SeedOptions = {}): Task {
  const id = opts.id ?? `t${++seq}`;
  const started = new Date(NOW.getTime() - (opts.startedAgoMs ?? 60_000));
  queries.insertTask(
    id, opts.category ?? 'implement', opts.tags ?? [],
    'desc', opts.project ?? null,
    started.toISOString(), null,
  );
  if (opts.status != null) {
    const ended = new Date(started.getTime() + ((opts.duration ?? 300) * 1000));
    queries.endTask(id, ended.toISOString(), opts.duration ?? 300, opts.status, null, null);
  }
  queries.updateTelemetry(id, {
    modelId: opts.modelId ?? null,
    contextTokens: opts.contextTokens ?? null,
    firstEditOffsetSeconds: opts.firstEditOffset ?? null,
    retryCount: opts.retries ?? null,
    testsPassedFirstTry: opts.testsPassedFirstTry ?? null,
  });
  const row = queries.getTask(id)!;
  return parseTask(row);
}

// ---------- scope / basic wiring ----------

describe('tasksInScope', () => {
  it('filters by scope window', () => {
    seed({ startedAgoMs: 30 * 60_000, status: 'completed' });         // 30 min ago
    seed({ startedAgoMs: 2 * 24 * 3600_000, status: 'completed' });    // 2 days ago
    const session = tasksInScope(queries, 'session', null, NOW);
    const day = tasksInScope(queries, 'day', null, NOW);
    const week = tasksInScope(queries, 'week', null, NOW);
    expect(session).toHaveLength(1);
    expect(day).toHaveLength(1);
    expect(week).toHaveLength(2);
  });

  it('filters by project when supplied', () => {
    seed({ status: 'completed', project: 'p1' });
    seed({ status: 'completed', project: 'p2' });
    const out = tasksInScope(queries, 'week', 'p1', NOW);
    expect(out).toHaveLength(1);
    expect(out[0].project).toBe('p1');
  });

  it('windowMsForScope is strictly increasing', () => {
    expect(windowMsForScope('session')).toBeLessThan(windowMsForScope('day'));
    expect(windowMsForScope('day')).toBeLessThan(windowMsForScope('week'));
  });
});

describe('generateReflectInsights', () => {
  it('returns no insights on an empty store', () => {
    expect(generateReflectInsights(queries, { scope: 'week', now: NOW })).toEqual([]);
  });
  it('never throws on a sparse dataset', () => {
    seed({ status: 'completed' });
    expect(() => generateReflectInsights(queries, { scope: 'week', now: NOW })).not.toThrow();
  });
});

// ---------- individual rules ----------

describe('ruleCategoryTagSlowdown', () => {
  it('emits when a tag is meaningfully slower than the category median', () => {
    // Category 'debug': 6 tasks overall, 3 tagged 'async' at 3× the rest.
    for (let i = 0; i < 3; i++) {
      seed({ category: 'debug', tags: ['foo'], duration: 100, status: 'completed', startedAgoMs: 60_000 });
    }
    for (let i = 0; i < 3; i++) {
      seed({ category: 'debug', tags: ['async'], duration: 400, status: 'completed', startedAgoMs: 60_000 });
    }
    const tasks = tasksInScope(queries, 'week', null, NOW);
    const ins = ruleCategoryTagSlowdown(tasks);
    expect(ins.length).toBeGreaterThan(0);
    const msg = ins.map(i => i.message).join(' ');
    expect(msg).toMatch(/debug/);
    expect(msg).toMatch(/async/);
  });

  it('stays silent when the spread is small', () => {
    for (let i = 0; i < 4; i++) {
      seed({ category: 'debug', tags: ['foo'], duration: 100, status: 'completed' });
      seed({ category: 'debug', tags: ['bar'], duration: 110, status: 'completed' });
    }
    const tasks = tasksInScope(queries, 'week', null, NOW);
    expect(ruleCategoryTagSlowdown(tasks)).toEqual([]);
  });
});

describe('ruleContextTokensImpact', () => {
  it('emits when first-edit latency differs by 25%+ between low/high context', () => {
    for (let i = 0; i < 4; i++) seed({
      status: 'completed', contextTokens: 50_000, firstEditOffset: 5,
    });
    for (let i = 0; i < 4; i++) seed({
      status: 'completed', contextTokens: 600_000, firstEditOffset: 15,
    });
    const tasks = tasksInScope(queries, 'week', null, NOW);
    const ins = ruleContextTokensImpact(tasks);
    expect(ins.length).toBeGreaterThan(0);
    expect(ins[0].message).toMatch(/context/);
  });

  it('stays silent without enough context-carrying tasks', () => {
    seed({ status: 'completed', contextTokens: 50_000, firstEditOffset: 5 });
    expect(ruleContextTokensImpact(tasksInScope(queries, 'week', null, NOW))).toEqual([]);
  });
});

describe('ruleTestsFirstTry', () => {
  it('emits when pass-rate spread across categories ≥ 30 pp', () => {
    // refactor: 4/4 pass on first try
    for (let i = 0; i < 4; i++) seed({ category: 'refactor', status: 'completed', testsPassedFirstTry: 1 });
    // implement: 1/4 pass on first try
    seed({ category: 'implement', status: 'completed', testsPassedFirstTry: 1 });
    for (let i = 0; i < 3; i++) seed({ category: 'implement', status: 'completed', testsPassedFirstTry: 0 });
    const tasks = tasksInScope(queries, 'week', null, NOW);
    const ins = ruleTestsFirstTry(tasks);
    expect(ins.length).toBe(1);
    expect(ins[0].message).toMatch(/refactor/);
    expect(ins[0].message).toMatch(/implement/);
  });
});

describe('ruleRetryHeavyTag', () => {
  it('emits when a tag retries ≥ 2× the overall average', () => {
    // 6 tasks avg 0.17 retries overall, tag 'db' averages 2
    for (let i = 0; i < 3; i++) seed({ tags: ['db'], status: 'completed', retries: 2 });
    for (let i = 0; i < 3; i++) seed({ tags: ['ui'], status: 'completed', retries: 0 });
    const tasks = tasksInScope(queries, 'week', null, NOW);
    const ins = ruleRetryHeavyTag(tasks);
    expect(ins.length).toBeGreaterThan(0);
    expect(ins.some(i => i.message.includes('db'))).toBe(true);
  });
});

describe('ruleFailureCluster', () => {
  it('emits when a category has >=50% failed/abandoned', () => {
    for (let i = 0; i < 2; i++) seed({ category: 'debug', status: 'completed' });
    for (let i = 0; i < 3; i++) seed({ category: 'debug', status: 'failed' });
    const tasks = tasksInScope(queries, 'week', null, NOW);
    const ins = ruleFailureCluster(tasks);
    expect(ins.length).toBe(1);
    expect(ins[0].message).toMatch(/debug/);
  });
});

describe('ruleModelComparison', () => {
  it('emits when one model is ≥ 1.5× slower than another on the same category', () => {
    for (let i = 0; i < 3; i++) seed({ category: 'refactor', modelId: 'opus', duration: 100, status: 'completed' });
    for (let i = 0; i < 3; i++) seed({ category: 'refactor', modelId: 'haiku', duration: 300, status: 'completed' });
    const tasks = tasksInScope(queries, 'week', null, NOW);
    const ins = ruleModelComparison(tasks);
    expect(ins.length).toBeGreaterThan(0);
    expect(ins[0].message).toMatch(/opus|haiku/);
  });
});

describe('ruleVelocityTrend', () => {
  it('emits when second-half median differs by ≥25% from first half', () => {
    // first half of week: 8 slow tasks
    for (let i = 0; i < 4; i++) {
      seed({ duration: 100, status: 'completed', startedAgoMs: 6 * 24 * 3600_000 });
    }
    // second half: 4 fast tasks
    for (let i = 0; i < 4; i++) {
      seed({ duration: 50, status: 'completed', startedAgoMs: 30 * 60_000 });
    }
    const tasks = tasksInScope(queries, 'week', null, NOW);
    const ins = ruleVelocityTrend(tasks, 'week', NOW);
    expect(ins.length).toBe(1);
    expect(ins[0].type).toBe('trend');
  });

  it('is silent for session scope', () => {
    for (let i = 0; i < 6; i++) seed({ status: 'completed', duration: 100 });
    const tasks = tasksInScope(queries, 'session', null, NOW);
    expect(ruleVelocityTrend(tasks, 'session', NOW)).toEqual([]);
  });
});

describe('ruleCalibrationStatus', () => {
  it('emits when a bucket has n≥3 and the shift is meaningful', () => {
    for (let i = 0; i < 5; i++) {
      recordResidual(queries, 'debug', 'opus', 'medium', 100, 200);
    }
    expect(ruleCalibrationStatus(queries).length).toBeGreaterThan(0);
  });

  it('stays silent when no bucket has enough samples', () => {
    expect(ruleCalibrationStatus(queries)).toEqual([]);
  });
});

describe('rulePlanModelStatus', () => {
  it('emits when k1 or k2 is meaningful and n≥5', () => {
    writeParams(queries, { k1: 60, k2: 25, n_observations: 10 });
    const ins = rulePlanModelStatus(queries);
    expect(ins.length).toBe(1);
    expect(ins[0].message).toMatch(/per task/);
  });

  it('stays silent below MIN_FITS_FOR_MODEL', () => {
    writeParams(queries, { k1: 60, k2: 25, n_observations: 2 });
    expect(rulePlanModelStatus(queries)).toEqual([]);
  });
});
