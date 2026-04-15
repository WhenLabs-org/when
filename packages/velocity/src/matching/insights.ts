import type { Task, Insight } from '../types.js';
import { formatDuration, median } from '../types.js';

const MIN_GROUP_SIZE = 3;

interface InsightOptions {
  lastNDays?: number;
}

/**
 * Generate actionable insights from completed task data.
 * Pure function: takes tasks, returns insights. No side effects.
 */
export function generateInsights(tasks: Task[], options?: InsightOptions): Insight[] {
  if (tasks.length < MIN_GROUP_SIZE) return [];

  const insights: Insight[] = [];

  insights.push(...compareCategorySpeed(tasks));
  insights.push(...compareTagSpeed(tasks));
  insights.push(...detectWeeklyTrend(tasks));
  insights.push(...detectProductivityByDayOfWeek(tasks));
  insights.push(...detectTimeOfDayPattern(tasks));
  insights.push(...detectFileCountCorrelation(tasks));

  return insights;
}

function confidenceForSize(n: number): 'high' | 'medium' | 'low' {
  if (n >= 10) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

function groupBy<K extends string>(tasks: Task[], keyFn: (t: Task) => K[]): Map<K, Task[]> {
  const groups = new Map<K, Task[]>();
  for (const task of tasks) {
    for (const key of keyFn(task)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(task);
    }
  }
  return groups;
}

function avgDuration(tasks: Task[]): number {
  const durations = tasks.map(t => t.duration_seconds).filter((d): d is number => d != null);
  if (durations.length === 0) return 0;
  return durations.reduce((s, d) => s + d, 0) / durations.length;
}

function medianDuration(tasks: Task[]): number {
  const durations = tasks.map(t => t.duration_seconds).filter((d): d is number => d != null);
  return median(durations);
}

// --- Insight generators ---

function compareCategorySpeed(tasks: Task[]): Insight[] {
  const groups = groupBy(tasks, t => [t.category]);
  const eligible = [...groups.entries()].filter(([, v]) => v.length >= MIN_GROUP_SIZE);
  if (eligible.length < 2) return [];

  const ranked = eligible
    .map(([cat, catTasks]) => ({ cat, avg: avgDuration(catTasks), count: catTasks.length }))
    .filter(r => r.avg > 0)
    .sort((a, b) => a.avg - b.avg);

  if (ranked.length < 2) return [];

  const fastest = ranked[0];
  const slowest = ranked[ranked.length - 1];
  const ratio = slowest.avg / fastest.avg;

  if (ratio < 1.3) return []; // not interesting enough

  const minCount = Math.min(fastest.count, slowest.count);

  return [{
    type: 'comparison',
    message: `${slowest.cat} tasks take ${ratio.toFixed(1)}x longer than ${fastest.cat} tasks on average (${formatDuration(slowest.avg)} vs ${formatDuration(fastest.avg)})`,
    confidence: confidenceForSize(minCount),
  }];
}

function compareTagSpeed(tasks: Task[]): Insight[] {
  const groups = groupBy(tasks, t => t.tags.length > 0 ? t.tags : []);
  const eligible = [...groups.entries()].filter(([, v]) => v.length >= MIN_GROUP_SIZE);
  if (eligible.length < 2) return [];

  const ranked = eligible
    .map(([tag, tagTasks]) => ({ tag, avg: avgDuration(tagTasks), count: tagTasks.length }))
    .filter(r => r.avg > 0)
    .sort((a, b) => a.avg - b.avg);

  if (ranked.length < 2) return [];

  const fastest = ranked[0];
  const slowest = ranked[ranked.length - 1];

  if (fastest.avg === 0) return [];
  const pctDiff = ((slowest.avg - fastest.avg) / fastest.avg) * 100;
  if (pctDiff < 20) return []; // not interesting

  const minCount = Math.min(fastest.count, slowest.count);

  return [{
    type: 'comparison',
    message: `${fastest.tag} tasks are ${Math.round(pctDiff)}% faster than ${slowest.tag} tasks (${formatDuration(fastest.avg)} vs ${formatDuration(slowest.avg)} avg)`,
    confidence: confidenceForSize(minCount),
  }];
}

function detectWeeklyTrend(tasks: Task[]): Insight[] {
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  const thisWeek = tasks.filter(t => now - new Date(t.started_at).getTime() < oneWeekMs);
  const lastWeek = tasks.filter(t => {
    const age = now - new Date(t.started_at).getTime();
    return age >= oneWeekMs && age < 2 * oneWeekMs;
  });

  if (thisWeek.length < MIN_GROUP_SIZE || lastWeek.length < MIN_GROUP_SIZE) return [];

  const thisAvg = medianDuration(thisWeek);
  const lastAvg = medianDuration(lastWeek);

  if (lastAvg === 0 || thisAvg === 0) return [];

  const pctChange = ((lastAvg - thisAvg) / lastAvg) * 100;
  if (Math.abs(pctChange) < 10) return [];

  const minCount = Math.min(thisWeek.length, lastWeek.length);
  const direction = pctChange > 0 ? 'improved' : 'slowed';
  const absChange = Math.abs(Math.round(pctChange));

  return [{
    type: 'trend',
    message: `Your task speed ${direction} ${absChange}% this week vs last week (median ${formatDuration(thisAvg)} vs ${formatDuration(lastAvg)})`,
    confidence: confidenceForSize(minCount),
  }];
}

function detectProductivityByDayOfWeek(tasks: Task[]): Insight[] {
  const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  const byDay = new Map<number, Task[]>();

  for (const task of tasks) {
    const day = new Date(task.started_at).getDay();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(task);
  }

  const eligible = [...byDay.entries()].filter(([, v]) => v.length >= MIN_GROUP_SIZE);
  if (eligible.length < 2) return [];

  const ranked = eligible
    .map(([day, dayTasks]) => ({ day, avg: avgDuration(dayTasks), count: dayTasks.length }))
    .filter(r => r.avg > 0)
    .sort((a, b) => a.avg - b.avg);

  if (ranked.length < 2) return [];

  const fastest = ranked[0];
  const overall = avgDuration(tasks);
  if (overall === 0) return [];

  const pctFaster = ((overall - fastest.avg) / overall) * 100;
  if (pctFaster < 10) return [];

  return [{
    type: 'pattern',
    message: `You're most productive on ${dayNames[fastest.day]} - tasks are ${Math.round(pctFaster)}% faster than your overall average`,
    confidence: confidenceForSize(fastest.count),
  }];
}

function detectTimeOfDayPattern(tasks: Task[]): Insight[] {
  const buckets: Record<string, Task[]> = {
    morning: [],   // 6-12
    afternoon: [], // 12-18
    evening: [],   // 18-24
    night: [],     // 0-6
  };

  for (const task of tasks) {
    const hour = new Date(task.started_at).getHours();
    if (hour >= 6 && hour < 12) buckets.morning.push(task);
    else if (hour >= 12 && hour < 18) buckets.afternoon.push(task);
    else if (hour >= 18) buckets.evening.push(task);
    else buckets.night.push(task);
  }

  const eligible = Object.entries(buckets).filter(([, v]) => v.length >= MIN_GROUP_SIZE);
  if (eligible.length < 2) return [];

  const ranked = eligible
    .map(([period, periodTasks]) => ({ period, avg: avgDuration(periodTasks), count: periodTasks.length }))
    .filter(r => r.avg > 0)
    .sort((a, b) => a.avg - b.avg);

  if (ranked.length < 2) return [];

  const fastest = ranked[0];
  const slowest = ranked[ranked.length - 1];
  if (fastest.avg === 0) return [];

  const pctDiff = ((slowest.avg - fastest.avg) / fastest.avg) * 100;
  if (pctDiff < 15) return [];

  const minCount = Math.min(fastest.count, slowest.count);

  return [{
    type: 'pattern',
    message: `${fastest.period} tasks are ${Math.round(pctDiff)}% faster than ${slowest.period} tasks (${formatDuration(fastest.avg)} vs ${formatDuration(slowest.avg)} avg)`,
    confidence: confidenceForSize(minCount),
  }];
}

function detectFileCountCorrelation(tasks: Task[]): Insight[] {
  const withFiles = tasks.filter(t =>
    t.duration_seconds != null &&
    (t.files_actual ?? t.files_changed ?? t.files_estimated) != null
  );

  if (withFiles.length < MIN_GROUP_SIZE * 2) return [];

  const small = withFiles.filter(t => {
    const fc = t.files_actual ?? t.files_changed ?? t.files_estimated ?? 0;
    return fc >= 1 && fc <= 2;
  });

  const large = withFiles.filter(t => {
    const fc = t.files_actual ?? t.files_changed ?? t.files_estimated ?? 0;
    return fc >= 5;
  });

  if (small.length < MIN_GROUP_SIZE || large.length < MIN_GROUP_SIZE) return [];

  const smallAvg = avgDuration(small);
  const largeAvg = avgDuration(large);

  if (smallAvg === 0) return [];

  const ratio = largeAvg / smallAvg;
  if (ratio < 1.3) return [];

  const minCount = Math.min(small.length, large.length);

  return [{
    type: 'pattern',
    message: `Tasks touching 5+ files take ${ratio.toFixed(1)}x longer than 1-2 file tasks (${formatDuration(largeAvg)} vs ${formatDuration(smallAvg)} avg)`,
    confidence: confidenceForSize(minCount),
  }];
}
