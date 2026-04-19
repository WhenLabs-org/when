import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from '../db/schema.js';
import { TaskQueries } from '../db/queries.js';
import {
  criticalPathSeconds,
  computePlanTotal,
  debugTailSeconds,
  DEFAULT_PARAMS,
  fitParams,
  maybeCompletePlan,
  MIN_FITS_FOR_MODEL,
  overheadSeconds,
  readParams,
  refit,
  writeParams,
  type PlanRunObservation,
  type PlanTaskInput,
} from '../matching/plan-model.js';

let db: Database.Database;
let queries: TaskQueries;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'velocity-plan-'));
  db = initDb(join(dir, 'test.db'));
  queries = new TaskQueries(db);
});

afterEach(() => {
  db.close();
});

describe('overheadSeconds', () => {
  it('returns 0 for 1 or 0 tasks', () => {
    expect(overheadSeconds(0, 60)).toBe(0);
    expect(overheadSeconds(1, 60)).toBe(0);
  });
  it('scales linearly with task count', () => {
    expect(overheadSeconds(5, 60)).toBe(300);
  });
  it('clamps negative k1 to 0', () => {
    expect(overheadSeconds(5, -60)).toBe(0);
  });
});

describe('debugTailSeconds', () => {
  it('is quadratic in debug count', () => {
    expect(debugTailSeconds(3, 10)).toBe(90);
    expect(debugTailSeconds(4, 10)).toBe(160);
  });
  it('zero debug count → 0', () => {
    expect(debugTailSeconds(0, 100)).toBe(0);
  });
});

describe('criticalPathSeconds', () => {
  it('with no deps treats plan as parallel → max task duration', () => {
    const items: PlanTaskInput[] = [
      { seconds: 100, category: 'implement' },
      { seconds: 300, category: 'implement' },
      { seconds: 50, category: 'test' },
    ];
    expect(criticalPathSeconds(items)).toBe(300);
  });

  it('single chain of deps sums to the serial total', () => {
    const items: PlanTaskInput[] = [
      { seconds: 100, category: 'implement' },
      { seconds: 200, category: 'implement', depends_on: [0] },
      { seconds: 50, category: 'test', depends_on: [1] },
    ];
    expect(criticalPathSeconds(items)).toBe(350);
  });

  it('fan-out + fan-in: two parallel branches, pick the longer', () => {
    const items: PlanTaskInput[] = [
      { seconds: 50, category: 'scaffold' },                                  // 0
      { seconds: 100, category: 'implement', depends_on: [0] },               // 1  ends at 150
      { seconds: 300, category: 'refactor', depends_on: [0] },                // 2  ends at 350
      { seconds: 20, category: 'test', depends_on: [1, 2] },                  // 3  starts at max(150,350)=350 -> ends 370
    ];
    expect(criticalPathSeconds(items)).toBe(370);
  });

  it('survives a malformed cycle by treating the back-edge as 0', () => {
    const items: PlanTaskInput[] = [
      { seconds: 100, category: 'implement', depends_on: [1] },
      { seconds: 200, category: 'implement', depends_on: [0] },
    ];
    const r = criticalPathSeconds(items);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThan(0);
  });
});

describe('computePlanTotal', () => {
  it('sum path (no deps) = Σ seconds + overhead + tail', () => {
    const items: PlanTaskInput[] = [
      { seconds: 100, category: 'implement' },
      { seconds: 200, category: 'debug' },
      { seconds: 50, category: 'debug' },
    ];
    const totals = computePlanTotal(items, { k1: 60, k2: 30, n_observations: 10 });
    expect(totals.sum_task_seconds).toBe(350);
    // has_dependencies=false, so critical_path == sum
    expect(totals.critical_path_seconds).toBe(350);
    expect(totals.overhead_seconds).toBe(3 * 60);
    expect(totals.debug_tail_seconds).toBe(2 * 2 * 30);
    expect(totals.total_seconds).toBe(350 + 180 + 120);
    expect(totals.debug_count).toBe(2);
    expect(totals.has_dependencies).toBe(false);
  });

  it('critical-path path when deps are present', () => {
    const items: PlanTaskInput[] = [
      { seconds: 100, category: 'implement' },
      { seconds: 200, category: 'debug', depends_on: [0] },
    ];
    const totals = computePlanTotal(items, { k1: 0, k2: 0, n_observations: 0 });
    expect(totals.has_dependencies).toBe(true);
    expect(totals.critical_path_seconds).toBe(300);
  });
});

describe('fitParams', () => {
  it('returns defaults with n_observations when below MIN_FITS_FOR_MODEL', () => {
    const few: PlanRunObservation[] = [{
      sum_task_seconds: 100, critical_path_seconds: 100,
      total_actual_seconds: 150, task_count: 2, debug_count: 0,
    }];
    const fit = fitParams(few);
    expect(fit.k1).toBe(DEFAULT_PARAMS.k1);
    expect(fit.k2).toBe(DEFAULT_PARAMS.k2);
    expect(fit.n_observations).toBe(1);
  });

  it('recovers true k1=60, k2=30 from noiseless synthetic data', () => {
    // y = 60*n + 30*d²  for a range of (n, d)
    const obs: PlanRunObservation[] = [];
    for (const n of [2, 3, 4, 5, 6]) {
      for (const d of [0, 1, 2, 3]) {
        const y = 60 * n + 30 * d * d;
        // critical path is irrelevant; y = actual - critical, so set critical=0
        obs.push({
          sum_task_seconds: 0, critical_path_seconds: 0,
          total_actual_seconds: y, task_count: n, debug_count: d,
        });
      }
    }
    const fit = fitParams(obs);
    expect(fit.k1).toBeCloseTo(60, 1);
    expect(fit.k2).toBeCloseTo(30, 1);
    expect(fit.n_observations).toBe(obs.length);
  });

  it('clamps to the hard ceiling when the data implies absurd values', () => {
    const obs: PlanRunObservation[] = [];
    // Implies k1 ≈ 10,000 s/task — way past the MAX_K1 cap (15 min).
    for (let i = 0; i < 10; i++) {
      obs.push({
        sum_task_seconds: 0, critical_path_seconds: 0,
        total_actual_seconds: 10_000, task_count: 1, debug_count: 0,
      });
    }
    const fit = fitParams(obs);
    expect(fit.k1).toBeLessThanOrEqual(15 * 60 + 1);
  });

  it('falls back to 1-D k1 fit when every observation has zero debug tasks (singular 2-D system)', () => {
    const obs: PlanRunObservation[] = [];
    for (const n of [2, 3, 4, 5, 6]) {
      obs.push({
        sum_task_seconds: 0, critical_path_seconds: 0,
        total_actual_seconds: 60 * n, task_count: n, debug_count: 0,
      });
    }
    const fit = fitParams(obs);
    expect(fit.k1).toBeCloseTo(60, 1);
    expect(fit.k2).toBe(0);
  });
});

describe('readParams / writeParams', () => {
  it('round-trips through the meta store', () => {
    writeParams(queries, { k1: 50, k2: 25, n_observations: 7 });
    const out = readParams(queries);
    expect(out.k1).toBe(50);
    expect(out.k2).toBe(25);
    expect(out.n_observations).toBe(7);
    expect(out.updated_at).toBeTruthy();
  });

  it('returns DEFAULT_PARAMS when meta entry is absent', () => {
    const out = readParams(queries);
    expect(out).toEqual(DEFAULT_PARAMS);
  });

  it('returns defaults on corrupt meta payload', () => {
    queries.setMeta('plan_model_params', '{not json');
    expect(readParams(queries)).toEqual(DEFAULT_PARAMS);
  });
});

describe('maybeCompletePlan + refit integration', () => {
  // Separate the baseline prediction from the actual duration so that
  // y = actual - critical reflects the overhead/tail we want to fit.
  function seedPlan(
    id: string,
    items: Array<{ id: string; category: string; predicted: number; actual: number }>,
  ): void {
    const plan = {
      items: items.map(i => ({ category: i.category, estimate_seconds: i.predicted })),
      sum_task_seconds: items.reduce((s, i) => s + i.predicted, 0),
      critical_path_seconds: items.reduce((s, i) => s + i.predicted, 0),
    };
    const totalPredicted = plan.sum_task_seconds;
    queries.insertPlanRun(id, new Date().toISOString(), JSON.stringify(plan), 'test-model', totalPredicted);
    for (const it of items) {
      queries.insertTask(it.id, it.category as never, [], 'x', null, '2026-01-01T00:00:00Z', null);
      queries.updateTelemetry(it.id, { parentPlanId: id });
      queries.endTask(it.id, '2026-01-01T00:05:00Z', it.actual, 'completed', null, null);
    }
  }

  it('is a no-op while any sibling task is still active', () => {
    queries.insertPlanRun('p1', new Date().toISOString(), JSON.stringify({ items: [] }), null, 100);
    queries.insertTask('a', 'implement', [], 'x', null, '2026-01-01T00:00:00Z', null);
    queries.updateTelemetry('a', { parentPlanId: 'p1' });
    // a is still active — no end.
    const changed = maybeCompletePlan(queries, 'p1');
    expect(changed).toBe(false);
    expect(queries.getPlanRun('p1')!.total_actual_seconds).toBeNull();
  });

  it('seals the plan once all siblings are ended and refits the model', () => {
    for (let i = 0; i < MIN_FITS_FOR_MODEL; i++) {
      const planId = `p-${i}`;
      seedPlan(planId, [
        { id: `p-${i}-t0`, category: 'implement', predicted: 100, actual: 100 },
        { id: `p-${i}-t1`, category: 'debug',     predicted: 200, actual: 200 },
      ]);
      const sealed = maybeCompletePlan(queries, planId);
      expect(sealed).toBe(true);
      const run = queries.getPlanRun(planId)!;
      expect(run.total_actual_seconds).toBe(300);
      expect(run.completed_at).toBeTruthy();
    }
    const params = readParams(queries);
    expect(params.n_observations).toBe(MIN_FITS_FOR_MODEL);
  });

  it('refits (k1, k2) toward true values over a run of synthetic plans', () => {
    // Model: actual_total = sum_predictions + 60*n + 30*d²
    // seedPlan sets critical_path == sum_task == sum_predictions, so
    // y = actual - critical = 60*n + 30*d² exactly — perfect input to fitParams.
    for (let i = 0; i < 10; i++) {
      const n = 2 + (i % 4);
      const d = i % 3;
      const items: Array<{ id: string; category: string; predicted: number; actual: number }> = [];
      for (let t = 0; t < n; t++) {
        items.push({
          id: `r${i}-t${t}`,
          category: t < d ? 'debug' : 'implement',
          predicted: 100,
          actual: 100,
        });
      }
      const inflation = 60 * n + 30 * d * d;
      items[items.length - 1].actual = 100 + inflation;
      seedPlan(`run-${i}`, items);
      maybeCompletePlan(queries, `run-${i}`);
    }
    const params = readParams(queries);
    expect(params.n_observations).toBeGreaterThanOrEqual(MIN_FITS_FOR_MODEL);
    // With 10 clean observations the fit should be within ±25% of truth.
    expect(params.k1).toBeGreaterThan(45);
    expect(params.k1).toBeLessThan(75);
    expect(params.k2).toBeGreaterThan(22);
    expect(params.k2).toBeLessThan(38);
  });
});

describe('refit (manual)', () => {
  it('is safe to call with no data — writes default params with n_observations=0', () => {
    const p = refit(queries);
    expect(p.k1).toBe(0);
    expect(p.k2).toBe(0);
    expect(p.n_observations).toBe(0);
  });
});
