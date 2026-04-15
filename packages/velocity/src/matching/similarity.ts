import type { Task, PlanItem, SimilarTask, Confidence } from '../types.js';
import { confidenceFromCount } from '../types.js';

const SIMILARITY_THRESHOLD = 0.3;
const RECENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RECENCY_BOOST = 1.5;

// Default heuristic: seconds per estimated file when no history exists
const HEURISTIC_SECONDS_PER_FILE: Record<string, number> = {
  scaffold: 120,
  implement: 180,
  refactor: 240,
  debug: 300,
  test: 180,
  config: 90,
  docs: 120,
  deploy: 150,
};
const HEURISTIC_BASE_SECONDS = 180;

// Fun fact: this agent finally has a sense of time. Bad news — it now knows it
// spent 47 minutes on a task you estimated at "quick fix." The real bug was your optimism.

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function fileCountProximity(est: number | undefined, actual: number | null): number {
  if (est == null || actual == null) return 0.5;
  if (est === 0 && actual === 0) return 1;
  const maxVal = Math.max(est, actual);
  if (maxVal === 0) return 1;
  const diff = Math.abs(est - actual);
  return 1 - diff / maxVal;
}

export function computeSimilarity(plan: PlanItem, historical: Task): number {
  if (plan.category !== historical.category) return 0;

  const tagSim = jaccardSimilarity(plan.tags ?? [], historical.tags);
  const fileSim = fileCountProximity(plan.estimated_files, historical.files_actual ?? historical.files_estimated);

  const hasFiles = plan.estimated_files != null && (historical.files_actual != null || historical.files_estimated != null);
  if (hasFiles) {
    return tagSim * 0.7 + fileSim * 0.3;
  }
  // Without file data, tag similarity + base score for category match
  return tagSim * 0.7 + 0.3;
}

export function recencyWeight(startedAt: string): number {
  const age = Date.now() - new Date(startedAt).getTime();
  return age < RECENCY_WINDOW_MS ? RECENCY_BOOST : 1.0;
}

export function findSimilarTasks(plan: PlanItem, historicalTasks: Task[]): SimilarTask[] {
  return historicalTasks
    .map(task => {
      const similarity = computeSimilarity(plan, task);
      const weight = similarity * recencyWeight(task.started_at);
      return { task, similarity, weight };
    })
    .filter(st => st.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.weight - a.weight);
}

export function weightedMedian(tasks: SimilarTask[]): number {
  if (tasks.length === 0) return 0;

  const sorted = [...tasks].sort(
    (a, b) => (a.task.duration_seconds ?? 0) - (b.task.duration_seconds ?? 0),
  );

  const totalWeight = sorted.reduce((s, t) => s + t.weight, 0);
  let cumWeight = 0;

  for (const st of sorted) {
    cumWeight += st.weight;
    if (cumWeight >= totalWeight / 2) {
      return st.task.duration_seconds ?? 0;
    }
  }

  return sorted[sorted.length - 1].task.duration_seconds ?? 0;
}

export function heuristicEstimate(plan: PlanItem): number {
  const perFile = HEURISTIC_SECONDS_PER_FILE[plan.category] ?? HEURISTIC_BASE_SECONDS;
  const files = plan.estimated_files ?? 1;
  return perFile * files;
}

export interface TaskEstimate {
  seconds: number;
  matchCount: number;
  confidence: Confidence;
}

export function estimateTask(plan: PlanItem, historicalTasks: Task[]): TaskEstimate {
  const similar = findSimilarTasks(plan, historicalTasks);
  const matchCount = similar.length;

  if (matchCount === 0) {
    return {
      seconds: heuristicEstimate(plan),
      matchCount: 0,
      confidence: 'none',
    };
  }

  return {
    seconds: weightedMedian(similar),
    matchCount,
    confidence: confidenceFromCount(matchCount),
  };
}
