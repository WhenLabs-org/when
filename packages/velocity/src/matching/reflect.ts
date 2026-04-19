import type { TaskQueries } from '../db/queries.js';
import type { Category, Insight, Task } from '../types.js';
import { formatDuration, median, parseTask } from '../types.js';
import { readParams } from './plan-model.js';
import { MIN_CALIBRATION_N } from './calibration.js';

const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export type ReflectScope = 'session' | 'day' | 'week';

const SESSION_WINDOW_MS = 4 * 60 * 60 * 1000;  // 4 h
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEEK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function windowMsForScope(scope: ReflectScope): number {
  switch (scope) {
    case 'session': return SESSION_WINDOW_MS;
    case 'day': return DAY_WINDOW_MS;
    case 'week': return WEEK_WINDOW_MS;
  }
}

// Minimum sample sizes for each rule — below these, an aggregate is too noisy
// to trust and the rule suppresses its output.
const MIN_TASKS_OVERALL = 3;
const MIN_TASKS_PER_BUCKET = 3;
const MIN_PAIR_RATIO = 1.5;       // category/tag, model comparison thresholds
const MIN_CONTEXT_DELTA = 0.25;   // 25% difference
const MIN_FIRST_TRY_SPREAD = 0.30; // 30 percentage points
const MIN_RETRY_RATIO = 2.0;
const MIN_FAILURE_RATE = 0.5;     // 50% failed/abandoned

// ---------------------------------------------------------------------------
// Helpers

export function tasksInScope(queries: TaskQueries, scope: ReflectScope, project?: string | null, now: Date = new Date()): Task[] {
  const sinceIso = new Date(now.getTime() - windowMsForScope(scope)).toISOString();
  return queries.getTasksSince(sinceIso, project ?? null).map(parseTask);
}

function completed(tasks: Task[]): Task[] {
  return tasks.filter(t => t.status === 'completed' && t.duration_seconds != null && t.duration_seconds > 0);
}

function durations(tasks: Task[]): number[] {
  return tasks.map(t => t.duration_seconds!).filter(d => d != null && d > 0);
}

function groupByCategory(tasks: Task[]): Map<Category, Task[]> {
  const map = new Map<Category, Task[]>();
  for (const t of tasks) {
    const list = map.get(t.category) ?? [];
    list.push(t);
    map.set(t.category, list);
  }
  return map;
}

function formatMultiplier(x: number): string {
  if (!Number.isFinite(x) || x <= 0) return '—';
  if (x < 1) return `${(1 / x).toFixed(1)}× faster`;
  return `${x.toFixed(1)}× slower`;
}

// ---------------------------------------------------------------------------
// Individual rules
// Each returns an array of insights (0 or more) given the scoped task set.
// ---------------------------------------------------------------------------

export function ruleCategoryTagSlowdown(tasks: Task[]): Insight[] {
  const done = completed(tasks);
  if (done.length < MIN_TASKS_OVERALL) return [];
  const byCat = groupByCategory(done);
  const out: Insight[] = [];

  for (const [cat, list] of byCat) {
    if (list.length < MIN_TASKS_PER_BUCKET) continue;
    const catMedian = median(durations(list));
    if (catMedian <= 0) continue;

    // Count tag -> tasks
    const byTag = new Map<string, Task[]>();
    for (const t of list) {
      for (const tag of t.tags) {
        const arr = byTag.get(tag) ?? [];
        arr.push(t);
        byTag.set(tag, arr);
      }
    }
    for (const [tag, tagList] of byTag) {
      if (tagList.length < MIN_TASKS_PER_BUCKET) continue;
      const tagMedian = median(durations(tagList));
      const ratio = tagMedian / catMedian;
      if (ratio >= MIN_PAIR_RATIO || ratio <= 1 / MIN_PAIR_RATIO) {
        out.push({
          type: 'comparison',
          message: `${formatMultiplier(ratio)} than median on '${cat}' tasks involving '${tag}' (${formatDuration(tagMedian)} vs ${formatDuration(catMedian)}; n=${tagList.length}).`,
          confidence: tagList.length >= 6 ? 'high' : 'medium',
        });
      }
    }
  }
  return out;
}

export function ruleContextTokensImpact(tasks: Task[]): Insight[] {
  const withCtx = tasks.filter(t =>
    t.context_tokens != null && t.context_tokens > 0 &&
    t.first_edit_offset_seconds != null && t.first_edit_offset_seconds >= 0,
  );
  if (withCtx.length < 6) return [];

  const contextValues = withCtx.map(t => t.context_tokens!).sort((a, b) => a - b);
  const cutoff = contextValues[Math.floor(contextValues.length / 2)];

  const low = withCtx.filter(t => (t.context_tokens ?? 0) < cutoff);
  const high = withCtx.filter(t => (t.context_tokens ?? 0) >= cutoff);
  if (low.length < MIN_TASKS_PER_BUCKET || high.length < MIN_TASKS_PER_BUCKET) return [];

  const lowMed = median(low.map(t => t.first_edit_offset_seconds!));
  const highMed = median(high.map(t => t.first_edit_offset_seconds!));
  if (lowMed <= 0 && highMed <= 0) return [];

  const delta = highMed - lowMed;
  const ratio = lowMed > 0 ? delta / lowMed : 0;
  if (Math.abs(ratio) < MIN_CONTEXT_DELTA) return [];

  const dir = ratio > 0 ? 'up' : 'down';
  return [{
    type: 'pattern',
    message: `First-edit latency is ${dir} ${Math.abs(Math.round(ratio * 100))}% when context ≥ ${(cutoff / 1000).toFixed(0)}k tokens (${formatDuration(highMed)} vs ${formatDuration(lowMed)}).`,
    confidence: withCtx.length >= 12 ? 'high' : 'medium',
  }];
}

export function ruleTestsFirstTry(tasks: Task[]): Insight[] {
  const withFlag = tasks.filter(t => t.tests_passed_first_try != null);
  if (withFlag.length < 6) return [];

  const byCat = groupByCategory(withFlag);
  const rates: Array<{ cat: Category; rate: number; n: number }> = [];
  for (const [cat, list] of byCat) {
    if (list.length < MIN_TASKS_PER_BUCKET) continue;
    const passes = list.filter(t => t.tests_passed_first_try === 1).length;
    rates.push({ cat, rate: passes / list.length, n: list.length });
  }
  if (rates.length < 2) return [];

  rates.sort((a, b) => b.rate - a.rate);
  const top = rates[0];
  const bot = rates[rates.length - 1];
  if (top.rate - bot.rate < MIN_FIRST_TRY_SPREAD) return [];

  return [{
    type: 'pattern',
    message: `Tests pass first try on ${Math.round(top.rate * 100)}% of '${top.cat}' tasks but only ${Math.round(bot.rate * 100)}% of '${bot.cat}' tasks (n=${top.n} vs ${bot.n}).`,
    confidence: Math.min(top.n, bot.n) >= 6 ? 'high' : 'medium',
  }];
}

export function ruleRetryHeavyTag(tasks: Task[]): Insight[] {
  const withRetries = tasks.filter(t => t.retry_count != null && t.retry_count >= 0);
  if (withRetries.length < 6) return [];

  const overallAvg = withRetries.reduce((s, t) => s + (t.retry_count ?? 0), 0) / withRetries.length;
  if (overallAvg <= 0.1) return [];

  const byTag = new Map<string, { sum: number; n: number }>();
  for (const t of withRetries) {
    for (const tag of t.tags) {
      const cur = byTag.get(tag) ?? { sum: 0, n: 0 };
      cur.sum += t.retry_count ?? 0;
      cur.n += 1;
      byTag.set(tag, cur);
    }
  }

  const out: Insight[] = [];
  for (const [tag, s] of byTag) {
    if (s.n < MIN_TASKS_PER_BUCKET) continue;
    const tagAvg = s.sum / s.n;
    const ratio = overallAvg > 0 ? tagAvg / overallAvg : 0;
    if (ratio >= MIN_RETRY_RATIO) {
      out.push({
        type: 'pattern',
        message: `'${tag}' tasks retry ${ratio.toFixed(1)}× more than average (${tagAvg.toFixed(1)} vs ${overallAvg.toFixed(1)}; n=${s.n}).`,
        confidence: s.n >= 6 ? 'high' : 'medium',
      });
    }
  }
  return out;
}

export function ruleFailureCluster(tasks: Task[]): Insight[] {
  const terminal = tasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'abandoned');
  if (terminal.length < MIN_TASKS_OVERALL) return [];

  const byCat = groupByCategory(terminal);
  const out: Insight[] = [];
  for (const [cat, list] of byCat) {
    if (list.length < MIN_TASKS_PER_BUCKET) continue;
    const bad = list.filter(t => t.status === 'failed' || t.status === 'abandoned').length;
    const rate = bad / list.length;
    if (rate >= MIN_FAILURE_RATE) {
      out.push({
        type: 'pattern',
        message: `${bad} of ${list.length} '${cat}' tasks were failed or abandoned (${Math.round(rate * 100)}%).`,
        confidence: list.length >= 6 ? 'high' : 'medium',
      });
    }
  }
  return out;
}

export function ruleModelComparison(tasks: Task[]): Insight[] {
  const done = completed(tasks).filter(t => t.model_id);
  if (done.length < 6) return [];

  // Group by (category, model) and emit when two models differ sharply on the
  // same category.
  const byCatModel = new Map<string, Task[]>();
  for (const t of done) {
    const key = `${t.category}|${t.model_id}`;
    const list = byCatModel.get(key) ?? [];
    list.push(t);
    byCatModel.set(key, list);
  }

  const byCat = new Map<Category, Array<{ model: string; med: number; n: number }>>();
  for (const [key, list] of byCatModel) {
    if (list.length < MIN_TASKS_PER_BUCKET) continue;
    const [cat, model] = key.split('|') as [Category, string];
    const med = median(durations(list));
    if (med <= 0) continue;
    const arr = byCat.get(cat) ?? [];
    arr.push({ model, med, n: list.length });
    byCat.set(cat, arr);
  }

  const out: Insight[] = [];
  for (const [cat, arr] of byCat) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.med - b.med);
    const fastest = arr[0];
    const slowest = arr[arr.length - 1];
    const ratio = slowest.med / fastest.med;
    if (ratio >= MIN_PAIR_RATIO) {
      out.push({
        type: 'comparison',
        message: `${slowest.model} is ${ratio.toFixed(1)}× slower than ${fastest.model} on '${cat}' (${formatDuration(slowest.med)} vs ${formatDuration(fastest.med)}).`,
        confidence: Math.min(fastest.n, slowest.n) >= 6 ? 'high' : 'medium',
      });
    }
  }
  return out;
}

export function ruleVelocityTrend(tasks: Task[], scope: ReflectScope, now: Date = new Date()): Insight[] {
  if (scope === 'session') return []; // Trend needs a week-ish window.
  const doneAll = completed(tasks);
  if (doneAll.length < 6) return [];

  const midpoint = new Date(now.getTime() - windowMsForScope(scope) / 2).toISOString();
  const recent = doneAll.filter(t => t.started_at >= midpoint);
  const earlier = doneAll.filter(t => t.started_at < midpoint);
  if (recent.length < MIN_TASKS_PER_BUCKET || earlier.length < MIN_TASKS_PER_BUCKET) return [];

  const recMed = median(durations(recent));
  const earMed = median(durations(earlier));
  if (earMed <= 0) return [];

  const delta = (recMed - earMed) / earMed;
  if (Math.abs(delta) < 0.25) return [];

  const dir = delta > 0 ? 'up' : 'down';
  return [{
    type: 'trend',
    message: `Median task duration is ${dir} ${Math.abs(Math.round(delta * 100))}% in the second half of this ${scope} (${formatDuration(recMed)} vs ${formatDuration(earMed)}).`,
    confidence: Math.min(recent.length, earlier.length) >= 6 ? 'high' : 'medium',
  }];
}

export function ruleCalibrationStatus(queries: TaskQueries): Insight[] {
  const rows = queries.listCalibration().filter(r => r.n >= MIN_CALIBRATION_N);
  if (rows.length === 0) return [];

  // Highlight the bucket with the biggest absolute shift, if nontrivial.
  rows.sort((a, b) => Math.abs(b.mean_log_error) - Math.abs(a.mean_log_error));
  const top = rows[0];
  const shift = Math.exp(top.mean_log_error);
  const pct = Math.round((shift - 1) * 100);
  if (Math.abs(pct) < 15) return [];

  const dir = pct > 0 ? 'over' : 'under';
  return [{
    type: 'pattern',
    message: `Calibration bucket '${top.category}|${top.bucket}' (n=${top.n}) is correcting predictions by ${Math.abs(pct)}% (${dir}estimation).`,
    confidence: top.n >= 10 ? 'high' : 'medium',
  }];
}

// ---- Rules ported from the old insights.ts (used by velocity_stats) -------

function avgDuration(tasks: Task[]): number {
  const ds = durations(tasks);
  return ds.length === 0 ? 0 : ds.reduce((s, d) => s + d, 0) / ds.length;
}

export function ruleOverallCategoryComparison(tasks: Task[]): Insight[] {
  const done = completed(tasks);
  const byCat = groupByCategory(done);
  const eligible = [...byCat.entries()].filter(([, v]) => v.length >= MIN_TASKS_PER_BUCKET);
  if (eligible.length < 2) return [];
  const ranked = eligible
    .map(([c, list]) => ({ c, avg: avgDuration(list), n: list.length }))
    .filter(r => r.avg > 0)
    .sort((a, b) => a.avg - b.avg);
  if (ranked.length < 2) return [];
  const fast = ranked[0];
  const slow = ranked[ranked.length - 1];
  const ratio = slow.avg / fast.avg;
  if (ratio < 1.3) return [];
  return [{
    type: 'comparison',
    message: `${slow.c} tasks take ${ratio.toFixed(1)}× longer than ${fast.c} tasks on average (${formatDuration(slow.avg)} vs ${formatDuration(fast.avg)}).`,
    confidence: Math.min(fast.n, slow.n) >= 10 ? 'high' : Math.min(fast.n, slow.n) >= 5 ? 'medium' : 'low',
  }];
}

export function ruleOverallTagComparison(tasks: Task[]): Insight[] {
  const done = completed(tasks);
  const byTag = new Map<string, Task[]>();
  for (const t of done) {
    for (const tag of t.tags) {
      const arr = byTag.get(tag) ?? [];
      arr.push(t);
      byTag.set(tag, arr);
    }
  }
  const eligible = [...byTag.entries()].filter(([, v]) => v.length >= MIN_TASKS_PER_BUCKET);
  if (eligible.length < 2) return [];
  const ranked = eligible
    .map(([tag, list]) => ({ tag, avg: avgDuration(list), n: list.length }))
    .filter(r => r.avg > 0)
    .sort((a, b) => a.avg - b.avg);
  if (ranked.length < 2) return [];
  const fast = ranked[0];
  const slow = ranked[ranked.length - 1];
  if (fast.avg === 0) return [];
  const pctDiff = ((slow.avg - fast.avg) / fast.avg) * 100;
  if (pctDiff < 20) return [];
  return [{
    type: 'comparison',
    message: `'${fast.tag}' tasks are ${Math.round(pctDiff)}% faster than '${slow.tag}' tasks (${formatDuration(fast.avg)} vs ${formatDuration(slow.avg)} avg).`,
    confidence: Math.min(fast.n, slow.n) >= 10 ? 'high' : Math.min(fast.n, slow.n) >= 5 ? 'medium' : 'low',
  }];
}

export function ruleDayOfWeekPattern(tasks: Task[]): Insight[] {
  const done = completed(tasks);
  const byDay = new Map<number, Task[]>();
  for (const t of done) {
    const day = new Date(t.started_at).getDay();
    const arr = byDay.get(day) ?? [];
    arr.push(t);
    byDay.set(day, arr);
  }
  const eligible = [...byDay.entries()].filter(([, v]) => v.length >= MIN_TASKS_PER_BUCKET);
  if (eligible.length < 2) return [];
  const ranked = eligible
    .map(([day, list]) => ({ day, avg: avgDuration(list), n: list.length }))
    .filter(r => r.avg > 0)
    .sort((a, b) => a.avg - b.avg);
  if (ranked.length < 2) return [];
  const fast = ranked[0];
  const overall = avgDuration(done);
  if (overall === 0) return [];
  const pctFaster = ((overall - fast.avg) / overall) * 100;
  if (pctFaster < 10) return [];
  return [{
    type: 'pattern',
    message: `Most productive on ${DAY_NAMES[fast.day]} — tasks ${Math.round(pctFaster)}% faster than the overall average.`,
    confidence: fast.n >= 10 ? 'high' : fast.n >= 5 ? 'medium' : 'low',
  }];
}

export function ruleTimeOfDayPattern(tasks: Task[]): Insight[] {
  const done = completed(tasks);
  const buckets: Record<'morning' | 'afternoon' | 'evening' | 'night', Task[]> = {
    morning: [], afternoon: [], evening: [], night: [],
  };
  for (const t of done) {
    const hour = new Date(t.started_at).getHours();
    if (hour >= 6 && hour < 12) buckets.morning.push(t);
    else if (hour >= 12 && hour < 18) buckets.afternoon.push(t);
    else if (hour >= 18) buckets.evening.push(t);
    else buckets.night.push(t);
  }
  const eligible = (Object.entries(buckets) as Array<[keyof typeof buckets, Task[]]>)
    .filter(([, v]) => v.length >= MIN_TASKS_PER_BUCKET);
  if (eligible.length < 2) return [];
  const ranked = eligible
    .map(([period, list]) => ({ period, avg: avgDuration(list), n: list.length }))
    .filter(r => r.avg > 0)
    .sort((a, b) => a.avg - b.avg);
  if (ranked.length < 2) return [];
  const fast = ranked[0];
  const slow = ranked[ranked.length - 1];
  if (fast.avg === 0) return [];
  const pctDiff = ((slow.avg - fast.avg) / fast.avg) * 100;
  if (pctDiff < 15) return [];
  return [{
    type: 'pattern',
    message: `${fast.period} tasks are ${Math.round(pctDiff)}% faster than ${slow.period} tasks (${formatDuration(fast.avg)} vs ${formatDuration(slow.avg)} avg).`,
    confidence: Math.min(fast.n, slow.n) >= 10 ? 'high' : Math.min(fast.n, slow.n) >= 5 ? 'medium' : 'low',
  }];
}

export function ruleFileCountCorrelation(tasks: Task[]): Insight[] {
  const done = completed(tasks).filter(t => (t.files_actual ?? t.files_changed ?? t.files_estimated) != null);
  if (done.length < MIN_TASKS_PER_BUCKET * 2) return [];
  const small = done.filter(t => {
    const fc = t.files_actual ?? t.files_changed ?? t.files_estimated ?? 0;
    return fc >= 1 && fc <= 2;
  });
  const large = done.filter(t => {
    const fc = t.files_actual ?? t.files_changed ?? t.files_estimated ?? 0;
    return fc >= 5;
  });
  if (small.length < MIN_TASKS_PER_BUCKET || large.length < MIN_TASKS_PER_BUCKET) return [];
  const smallAvg = avgDuration(small);
  const largeAvg = avgDuration(large);
  if (smallAvg === 0) return [];
  const ratio = largeAvg / smallAvg;
  if (ratio < 1.3) return [];
  return [{
    type: 'pattern',
    message: `Tasks touching 5+ files take ${ratio.toFixed(1)}× longer than 1-2 file tasks (${formatDuration(largeAvg)} vs ${formatDuration(smallAvg)} avg).`,
    confidence: Math.min(small.length, large.length) >= 10 ? 'high' : Math.min(small.length, large.length) >= 5 ? 'medium' : 'low',
  }];
}

export function rulePlanModelStatus(queries: TaskQueries): Insight[] {
  const params = readParams(queries);
  if (params.n_observations < 5) return [];
  const parts: string[] = [];
  if (params.k1 >= 30) parts.push(`+${Math.round(params.k1)}s per task`);
  if (params.k2 >= 10) parts.push(`+${Math.round(params.k2)}s per debug² term`);
  if (parts.length === 0) return [];
  return [{
    type: 'pattern',
    message: `Plan overhead from ${params.n_observations} completed plans: ${parts.join(' and ')}.`,
    confidence: params.n_observations >= 15 ? 'high' : 'medium',
  }];
}

// ---------------------------------------------------------------------------
// Driver

export interface ReflectOptions {
  scope: ReflectScope;
  project?: string | null;
  now?: Date;
}

function runAllRules(tasks: Task[], queries: TaskQueries, scope: ReflectScope, now: Date): Insight[] {
  const out: Insight[] = [];
  const safe = (fn: () => Insight[]): void => { try { out.push(...fn()); } catch { /* never fatal */ } };
  // Rules driven by rich telemetry (Phase 2+).
  safe(() => ruleCategoryTagSlowdown(tasks));
  safe(() => ruleContextTokensImpact(tasks));
  safe(() => ruleTestsFirstTry(tasks));
  safe(() => ruleRetryHeavyTag(tasks));
  safe(() => ruleFailureCluster(tasks));
  safe(() => ruleModelComparison(tasks));
  safe(() => ruleVelocityTrend(tasks, scope, now));
  // Rules ported from the old insights.ts.
  safe(() => ruleOverallCategoryComparison(tasks));
  safe(() => ruleOverallTagComparison(tasks));
  safe(() => ruleDayOfWeekPattern(tasks));
  safe(() => ruleTimeOfDayPattern(tasks));
  safe(() => ruleFileCountCorrelation(tasks));
  // Rules that need the queries handle directly.
  safe(() => ruleCalibrationStatus(queries));
  safe(() => rulePlanModelStatus(queries));
  return out;
}

export function generateReflectInsights(queries: TaskQueries, opts: ReflectOptions): Insight[] {
  const now = opts.now ?? new Date();
  const tasks = tasksInScope(queries, opts.scope, opts.project ?? null, now);
  return runAllRules(tasks, queries, opts.scope, now);
}

/** Same rules, but over a caller-supplied task set (e.g. `velocity_stats`'s
 *  already-filtered list). Scope defaults to 'week' for trend-style rules. */
export function generateReflectInsightsFromTasks(
  tasks: Task[],
  queries: TaskQueries,
  opts: { scope?: ReflectScope; now?: Date } = {},
): Insight[] {
  return runAllRules(tasks, queries, opts.scope ?? 'week', opts.now ?? new Date());
}
