import type { TaskQueries } from '../db/queries.js';
import type { Category } from '../types.js';
import { CATEGORIES } from '../types.js';
import {
  bufferToVector,
  cosineSimilarity,
  taskEmbeddingText,
  tryEmbed,
  type Embedder,
} from './embedding.js';

// How many historical tasks we pull in to vote on a new task's category.
// 200 is plenty: the top-K filter below keeps only the closest ones.
export const CLASSIFIER_CANDIDATE_POOL = 200;

// Consider only candidates at least this similar to the new description.
export const CLASSIFIER_MIN_SIMILARITY = 0.3;

// Need at least this many candidates above the similarity threshold before
// we trust the vote. Below that we fall back to the caller's default.
export const CLASSIFIER_MIN_CANDIDATES = 3;

// How many top-scoring candidates contribute to the vote.
export const CLASSIFIER_TOP_K = 5;

// Winner must beat runner-up by at least this factor or the result is
// considered a tie and we fall back. Prevents confidently-wrong reclassifications.
export const CLASSIFIER_MARGIN = 1.3;

export interface ClassifyResult {
  category: Category;
  source: 'semantic' | 'fallback';
  top_k?: Array<{ category: Category; score: number }>;
  margin?: number;
}

function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Classify a new task's category by embedding its text and voting among
 * the most semantically similar historical tasks. Fully local — no API.
 *
 * Semantic path:
 *   1. Embed `description + tags`.
 *   2. Score every recent completed task (across ALL categories) by cosine.
 *   3. Take the top-K above CLASSIFIER_MIN_SIMILARITY.
 *   4. Sum similarity scores per category.
 *   5. Winner must beat runner-up by ≥ CLASSIFIER_MARGIN or we fall back.
 *
 * The fallback is provided by the caller (e.g. file-path regex inference).
 */
export async function classifyCategory(
  description: string,
  tags: string[],
  queries: TaskQueries,
  embedder: Embedder,
  fallback: Category,
): Promise<ClassifyResult> {
  const text = taskEmbeddingText(description, tags);
  const planVec = await tryEmbed(embedder, text);
  if (!planVec) return { category: fallback, source: 'fallback' };

  const candidates = queries.getRecentEmbeddedTasks(CLASSIFIER_CANDIDATE_POOL);
  if (candidates.length < CLASSIFIER_MIN_CANDIDATES) {
    return { category: fallback, source: 'fallback' };
  }

  const scored: Array<{ category: Category; score: number }> = [];
  for (const row of candidates) {
    if (!row.embedding || !isCategory(row.category)) continue;
    const vec = bufferToVector(row.embedding);
    if (vec.length !== planVec.length) continue;
    const score = cosineSimilarity(planVec, vec);
    if (score >= CLASSIFIER_MIN_SIMILARITY) {
      scored.push({ category: row.category, score });
    }
  }
  if (scored.length < CLASSIFIER_MIN_CANDIDATES) {
    return { category: fallback, source: 'fallback' };
  }

  scored.sort((a, b) => b.score - a.score);
  const topK = scored.slice(0, CLASSIFIER_TOP_K);

  // Weighted vote by similarity.
  const votes = new Map<Category, number>();
  for (const { category, score } of topK) {
    votes.set(category, (votes.get(category) ?? 0) + score);
  }

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const winner = ranked[0];
  const runnerUp = ranked[1];

  // Tie-breaker: require a clear margin, else fall back.
  if (runnerUp && winner[1] < runnerUp[1] * CLASSIFIER_MARGIN) {
    return {
      category: fallback,
      source: 'fallback',
      top_k: topK,
      margin: winner[1] / runnerUp[1],
    };
  }

  return {
    category: winner[0],
    source: 'semantic',
    top_k: topK,
    margin: runnerUp ? winner[1] / runnerUp[1] : Infinity,
  };
}
