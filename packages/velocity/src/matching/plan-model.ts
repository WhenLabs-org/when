import type { TaskQueries } from '../db/queries.js';
import type { Category } from '../types.js';

// Plan-level model: total = Σ task_i + overhead(n) + debug_tail(d)
//   overhead(n) = k1 · n                  -- per-task context-switch cost
//   debug_tail(d) = k2 · d²               -- debug-heavy plans compound
//
// Parameters (k1, k2) are fit from completed plan_runs via ordinary least
// squares and stored in the `meta` table. Below MIN_FITS_FOR_MODEL we use
// defaults of (0, 0), making the model collapse to a naive sum — i.e. no
// regression against the Phase 3 behaviour for new users.

const PARAMS_META_KEY = 'plan_model_params';

export const DEFAULT_K1 = 0;   // seconds of overhead per extra task
export const DEFAULT_K2 = 0;   // seconds per debug_count² coefficient
export const MIN_FITS_FOR_MODEL = 5;      // need this many plan_runs to fit
export const REFIT_WINDOW = 50;           // consider the most recent N plan_runs

// Hard caps keep a pathological single plan from blowing up the model.
const MAX_K1 = 15 * 60;    // <= 15 minutes per task of pure overhead
const MAX_K2 = 20 * 60;    // <= 20 minutes per debug² term

export interface PlanModelParams {
  k1: number;
  k2: number;
  n_observations: number;
  updated_at?: string;
}

export const DEFAULT_PARAMS: PlanModelParams = { k1: DEFAULT_K1, k2: DEFAULT_K2, n_observations: 0 };

export function readParams(queries: TaskQueries): PlanModelParams {
  const raw = queries.getMeta(PARAMS_META_KEY);
  if (!raw) return DEFAULT_PARAMS;
  try {
    const parsed = JSON.parse(raw) as Partial<PlanModelParams>;
    return {
      k1: typeof parsed.k1 === 'number' ? parsed.k1 : DEFAULT_K1,
      k2: typeof parsed.k2 === 'number' ? parsed.k2 : DEFAULT_K2,
      n_observations: typeof parsed.n_observations === 'number' ? parsed.n_observations : 0,
      updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : undefined,
    };
  } catch {
    return DEFAULT_PARAMS;
  }
}

export function writeParams(queries: TaskQueries, params: PlanModelParams): void {
  queries.setMeta(PARAMS_META_KEY, JSON.stringify({ ...params, updated_at: new Date().toISOString() }));
}

// --- Overhead and tail ------------------------------------------------------

export function overheadSeconds(taskCount: number, k1: number = DEFAULT_K1): number {
  if (taskCount <= 1) return 0;
  return Math.max(0, k1) * taskCount;
}

export function debugTailSeconds(debugCount: number, k2: number = DEFAULT_K2): number {
  if (debugCount <= 0) return 0;
  return Math.max(0, k2) * debugCount * debugCount;
}

// --- Critical-path computation ---------------------------------------------

export interface PlanTaskInput {
  seconds: number;          // per-task median estimate
  depends_on?: number[];    // indices into the same array
  category: Category;
}

export interface PlanTotalBreakdown {
  sum_task_seconds: number;
  critical_path_seconds: number;   // longest dependency chain (or sum if none)
  overhead_seconds: number;
  debug_tail_seconds: number;
  total_seconds: number;
  debug_count: number;
  has_dependencies: boolean;
  cycles: number[][];   // non-empty = the dep graph has a cycle; callers should warn
}

/**
 * Compute end-time for each task assuming tasks with no deps can run in
 * parallel. Returns the earliest-completion time of the whole plan.
 */
export function criticalPathSeconds(items: PlanTaskInput[]): number {
  if (items.length === 0) return 0;

  // Memoised "end time" per task — longest path from any root to this task
  // plus its own duration.
  const endTime = new Array<number | null>(items.length).fill(null);
  const computing = new Array<boolean>(items.length).fill(false);

  function endOf(i: number): number {
    const cached = endTime[i];
    if (cached != null) return cached;
    if (computing[i]) {
      // Cycle — treat the offending back-edge as 0 to avoid infinite recursion.
      return 0;
    }
    computing[i] = true;
    const item = items[i];
    const deps = (item.depends_on ?? []).filter(d => d >= 0 && d < items.length && d !== i);
    let startAfter = 0;
    for (const d of deps) startAfter = Math.max(startAfter, endOf(d));
    const own = Math.max(0, item.seconds);
    const result = startAfter + own;
    endTime[i] = result;
    computing[i] = false;
    return result;
  }

  let maxEnd = 0;
  for (let i = 0; i < items.length; i++) maxEnd = Math.max(maxEnd, endOf(i));
  return maxEnd;
}

export function hasAnyDependencies(items: PlanTaskInput[]): boolean {
  return items.some(i => Array.isArray(i.depends_on) && i.depends_on.length > 0);
}

/**
 * Return every simple cycle in the dependency DAG as a list of node indices.
 * Empty array means the graph is acyclic. Used to warn the user instead of
 * silently defanging a cycle inside criticalPathSeconds.
 */
export function detectPlanCycles(items: PlanTaskInput[]): number[][] {
  const cycles: number[][] = [];
  const pathIndex = new Map<number, number>();
  const path: number[] = [];
  const finished = new Set<number>();

  function dfs(node: number): void {
    if (finished.has(node)) return;
    if (pathIndex.has(node)) {
      const start = pathIndex.get(node)!;
      cycles.push(path.slice(start).concat(node));
      return;
    }
    pathIndex.set(node, path.length);
    path.push(node);
    const deps = items[node]?.depends_on ?? [];
    for (const d of deps) {
      if (d < 0 || d >= items.length || d === node) continue;
      dfs(d);
    }
    path.pop();
    pathIndex.delete(node);
    finished.add(node);
  }

  for (let i = 0; i < items.length; i++) dfs(i);
  return cycles;
}

export function computePlanTotal(items: PlanTaskInput[], params: PlanModelParams): PlanTotalBreakdown {
  const sumTask = items.reduce((s, i) => s + Math.max(0, i.seconds), 0);
  const withDeps = hasAnyDependencies(items);
  const cycles = withDeps ? detectPlanCycles(items) : [];
  const critical = withDeps ? criticalPathSeconds(items) : sumTask;
  const debugCount = items.filter(i => i.category === 'debug').length;
  const ohead = overheadSeconds(items.length, params.k1);
  const tail = debugTailSeconds(debugCount, params.k2);
  return {
    sum_task_seconds: sumTask,
    critical_path_seconds: critical,
    overhead_seconds: ohead,
    debug_tail_seconds: tail,
    total_seconds: critical + ohead + tail,
    debug_count: debugCount,
    has_dependencies: withDeps,
    cycles,
  };
}

// --- Least-squares fit -----------------------------------------------------

export interface PlanRunObservation {
  sum_task_seconds: number;   // sum of per-task predictions at estimate time
  critical_path_seconds: number;
  total_actual_seconds: number;
  task_count: number;
  debug_count: number;
}

/**
 * Fit (k1, k2) so that:
 *   y_i = k1 * n_i + k2 * d_i²
 * where y_i = total_actual - critical_path (the "extra" overhead explained
 * by the plan-level model).
 *
 * Closed-form via the 2x2 normal equation. Requires >= MIN_FITS_FOR_MODEL
 * observations to emit non-zero fits; otherwise returns defaults.
 */
export function fitParams(obs: PlanRunObservation[]): PlanModelParams {
  if (obs.length < MIN_FITS_FOR_MODEL) {
    return { ...DEFAULT_PARAMS, n_observations: obs.length };
  }

  // Build the normal-equation entries:
  //   sum_n2    = Σ n_i²
  //   sum_n_d2  = Σ n_i · d_i²
  //   sum_d4    = Σ (d_i²)²
  //   sum_ny    = Σ n_i · y_i
  //   sum_d2y   = Σ d_i² · y_i
  let sumN2 = 0, sumND2 = 0, sumD4 = 0, sumNY = 0, sumD2Y = 0;
  for (const o of obs) {
    const n = Math.max(0, o.task_count);
    const d2 = Math.max(0, o.debug_count) ** 2;
    const y = o.total_actual_seconds - o.critical_path_seconds;
    sumN2 += n * n;
    sumND2 += n * d2;
    sumD4 += d2 * d2;
    sumNY += n * y;
    sumD2Y += d2 * y;
  }

  // Solve [[sumN2, sumND2], [sumND2, sumD4]] · [k1, k2] = [sumNY, sumD2Y]
  const det = sumN2 * sumD4 - sumND2 * sumND2;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-6) {
    // Singular — e.g. every plan has zero debug tasks. Fall back to a
    // 1-D fit for k1 only.
    if (sumN2 > 0) {
      const k1 = sumNY / sumN2;
      return {
        k1: Math.max(0, Math.min(MAX_K1, k1)),
        k2: DEFAULT_K2,
        n_observations: obs.length,
      };
    }
    return { ...DEFAULT_PARAMS, n_observations: obs.length };
  }

  const k1 = (sumD4 * sumNY - sumND2 * sumD2Y) / det;
  const k2 = (sumN2 * sumD2Y - sumND2 * sumNY) / det;
  return {
    k1: Math.max(0, Math.min(MAX_K1, k1)),
    k2: Math.max(0, Math.min(MAX_K2, k2)),
    n_observations: obs.length,
  };
}

// --- Refit driven by plan-run completion ----------------------------------

export interface PlanRunJsonEntry {
  category: Category;
  depends_on?: number[];
  // We stash each item's point estimate at plan-creation time so the fit
  // uses the model's own prediction as the baseline.
  estimate_seconds?: number;
}

export interface StoredPlanJson {
  items: PlanRunJsonEntry[];
  critical_path_seconds?: number;
  sum_task_seconds?: number;
}

function safeParsePlanJson(raw: string): StoredPlanJson | null {
  try {
    const parsed = JSON.parse(raw) as StoredPlanJson;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function recentCompletedObservations(queries: TaskQueries, limit: number = REFIT_WINDOW): PlanRunObservation[] {
  const runs = queries.getRecentPlanRuns(limit);
  const obs: PlanRunObservation[] = [];
  for (const r of runs) {
    if (r.total_actual_seconds == null) continue;
    const parsed = safeParsePlanJson(r.plan_json);
    if (!parsed) continue;
    const sumTask = parsed.sum_task_seconds
      ?? parsed.items.reduce((s, i) => s + Math.max(0, i.estimate_seconds ?? 0), 0);
    const critical = parsed.critical_path_seconds ?? sumTask;
    const debugCount = parsed.items.filter(i => i.category === 'debug').length;
    obs.push({
      sum_task_seconds: sumTask,
      critical_path_seconds: critical,
      total_actual_seconds: r.total_actual_seconds,
      task_count: parsed.items.length,
      debug_count: debugCount,
    });
  }
  return obs;
}

/** Fit on the recent window and persist params. Safe to call frequently. */
export function refit(queries: TaskQueries): PlanModelParams {
  const obs = recentCompletedObservations(queries);
  const params = fitParams(obs);
  writeParams(queries, params);
  return params;
}

/**
 * Called from end-task when a task with parent_plan_id finishes. Sums actual
 * durations of every task in that plan, persists total_actual_seconds, and
 * refits the model.
 *
 * Skips if any sibling task in the plan is still active (ended_at IS NULL).
 */
export function maybeCompletePlan(queries: TaskQueries, planId: string): boolean {
  const run = queries.getPlanRun(planId);
  if (!run || run.total_actual_seconds != null) return false;

  const siblings = queries.getPlanSiblingSummary(planId);
  if (siblings.total === 0) return false;
  if (siblings.active > 0) return false;

  if (siblings.total_duration <= 0) return false;

  const completedAt = new Date().toISOString();
  queries.completePlanRun(planId, siblings.total_duration, completedAt);
  refit(queries);
  return true;
}
