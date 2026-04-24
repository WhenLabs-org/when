import type { Task, PlanItem, SimilarTask, Confidence } from '../types.js';
import { confidenceFromCount, percentile } from '../types.js';
import type { TaskQueries } from '../db/queries.js';
import { calibrate, getStats, type CalibratedEstimate } from './calibration.js';
import { bucketKey } from './calibration.js';
import { bufferToVector, cosineSimilarity } from './embedding.js';

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

export function descriptionLengthRatio(a: string, b: string): number {
  const la = a?.length ?? 0;
  const lb = b?.length ?? 0;
  if (la === 0 && lb === 0) return 1;
  const maxL = Math.max(la, lb);
  if (maxL === 0) return 1;
  return Math.min(la, lb) / maxL;
}

// Clamp negative cosine scores to 0 so embeddings and Jaccard share the
// same [0,1] scale when mixed in findSimilarTasks ranking.
function clampUnit(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function computeSimilarity(plan: PlanItem, historical: Task): number {
  if (plan.category !== historical.category) return 0;

  // Semantic path: both sides have embeddings -> cosine + file + desc-length.
  if (plan.embedding && historical.embedding) {
    const hVec = bufferToVector(historical.embedding);
    if (hVec.length === plan.embedding.length && hVec.length > 0) {
      const semantic = clampUnit(cosineSimilarity(plan.embedding, hVec));
      const fileSim = fileCountProximity(plan.estimated_files, historical.files_actual ?? historical.files_estimated);
      const descRatio = descriptionLengthRatio(plan.description, historical.description);
      return semantic * 0.6 + fileSim * 0.2 + descRatio * 0.2;
    }
    // Dimension mismatch (e.g. re-embedded under a different model) — fall
    // through to Jaccard rather than produce a garbage score.
  }

  // Jaccard fallback (original pre-Phase 4 behaviour).
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
  const valid = tasks.filter(t => t.task.duration_seconds != null);
  if (valid.length === 0) return 0;

  const sorted = [...valid].sort(
    (a, b) => (a.task.duration_seconds ?? 0) - (b.task.duration_seconds ?? 0),
  );

  const totalWeight = sorted.reduce((s, t) => s + t.weight, 0);
  let cumWeight = 0;

  for (const st of sorted) {
    cumWeight += st.weight;
    if (cumWeight >= totalWeight / 2) {
      return st.task.duration_seconds!;
    }
  }

  return sorted[sorted.length - 1].task.duration_seconds!;
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
  p25_seconds: number;
  median_seconds: number;
  p75_seconds: number;
  /** The underlying matched tasks, sorted by weight desc. Populated by
   *  {@link estimateTask}; federated mixing preserves it by spreading the
   *  local estimate. Absent on priors-only paths that skip similarity. */
  similar?: SimilarTask[];
}

/**
 * Compute the raw estimate, then apply bucket-level calibration if we have
 * enough observed residuals for (category, modelId, confidence). Fallback is
 * the raw estimate with `calibrated: false`.
 */
export function estimateTaskCalibrated(
  plan: PlanItem,
  historicalTasks: Task[],
  queries: TaskQueries,
  modelId?: string | null,
): CalibratedEstimate {
  const raw = estimateTask(plan, historicalTasks);
  const stats = getStats(queries, plan.category, modelId ?? null, raw.confidence);
  return calibrate(raw, stats, bucketKey(modelId, raw.confidence));
}

/** Local calibrated estimate, then — only if local matches are thin —
 *  mix in federated priors via inverse-variance weighting. Silently
 *  degrades to the local estimate if federation is disabled or unavailable. */
export async function estimateTaskWithFederation(
  plan: PlanItem,
  historicalTasks: Task[],
  queries: TaskQueries,
  modelId?: string | null,
): Promise<CalibratedEstimate & { federated?: boolean; federated_n?: number | null }> {
  const local = estimateTaskCalibrated(plan, historicalTasks, queries, modelId);
  if (local.matchCount >= 3) return local;

  // Lazy import so the federation module never loads on boot unless needed.
  const { fetchPriorsIfEnabled } = await import('../federation/client.js');
  const { mixWithPrior } = await import('../federation/mixing.js');
  try {
    const priors = await fetchPriorsIfEnabled({ category: plan.category, model_id: modelId ?? null });
    if (!priors) return local;
    const mixed = mixWithPrior(local, priors);
    return {
      ...local,
      seconds: mixed.seconds,
      median_seconds: mixed.median_seconds,
      p25_seconds: mixed.p25_seconds,
      p75_seconds: mixed.p75_seconds,
      confidence: mixed.confidence,
      federated: true,
      federated_n: mixed.federated_n,
    };
  } catch {
    return local;
  }
}

export function estimateTask(plan: PlanItem, historicalTasks: Task[]): TaskEstimate {
  const similar = findSimilarTasks(plan, historicalTasks);
  const matchCount = similar.length;

  if (matchCount === 0) {
    const heuristic = heuristicEstimate(plan);
    return {
      seconds: heuristic,
      matchCount: 0,
      confidence: 'none',
      p25_seconds: heuristic,
      median_seconds: heuristic,
      p75_seconds: heuristic,
      similar: [],
    };
  }

  const durations = similar
    .filter(s => s.task.duration_seconds != null)
    .map(s => s.task.duration_seconds!);

  const p25 = percentile(durations, 25);
  const p50 = percentile(durations, 50);
  const p75 = percentile(durations, 75);

  return {
    seconds: weightedMedian(similar),
    matchCount,
    confidence: confidenceFromCount(matchCount),
    p25_seconds: Math.round(p25),
    median_seconds: Math.round(p50),
    p75_seconds: Math.round(p75),
    similar,
  };
}
