// --- Enums & constants ---

export const CATEGORIES = [
  'scaffold', 'implement', 'refactor', 'debug',
  'test', 'config', 'docs', 'deploy',
] as const;
export type Category = typeof CATEGORIES[number];

export const STATUSES = ['completed', 'failed', 'abandoned'] as const;
export type TaskStatus = typeof STATUSES[number];

export const GROUP_BY_OPTIONS = ['category', 'tag', 'project', 'day', 'week'] as const;
export type GroupBy = typeof GROUP_BY_OPTIONS[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'none'] as const;
export type Confidence = typeof CONFIDENCE_LEVELS[number];

// --- Database row types ---

export interface TaskRow {
  id: string;
  category: Category;
  tags: string; // JSON-serialized string[]
  description: string;
  project: string | null;
  started_at: string; // ISO 8601
  ended_at: string | null;
  duration_seconds: number | null;
  status: TaskStatus | null;
  files_estimated: number | null;
  files_actual: number | null;
  notes: string | null;
  lines_added: number | null;
  lines_removed: number | null;
  files_changed: number | null;
  git_diff_stat: string | null;
  // v3: prediction storage (for calibration loop)
  predicted_duration_seconds: number | null;
  predicted_p25_seconds: number | null;
  predicted_p75_seconds: number | null;
  predicted_confidence: Confidence | null;
  // v3: agent/model telemetry
  model_id: string | null;
  context_tokens: number | null;
  tools_used: string | null; // JSON-serialized string[]
  tool_call_count: number | null;
  turn_count: number | null;
  first_edit_offset_seconds: number | null;
  retry_count: number | null;
  tests_passed_first_try: number | null; // 0 | 1
  // v3: embeddings
  embedding: Buffer | null;
  embedding_model: string | null;
  // v3: plan linkage & pauses
  paused_seconds: number | null;
  parent_task_id: string | null;
  parent_plan_id: string | null;
}

// --- Parsed task (after JSON parse of tags) ---

export interface Task {
  id: string;
  category: Category;
  tags: string[];
  description: string;
  project: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: TaskStatus | null;
  files_estimated: number | null;
  files_actual: number | null;
  notes: string | null;
  lines_added: number | null;
  lines_removed: number | null;
  files_changed: number | null;
  git_diff_stat: string | null;
  predicted_duration_seconds: number | null;
  predicted_p25_seconds: number | null;
  predicted_p75_seconds: number | null;
  predicted_confidence: Confidence | null;
  model_id: string | null;
  context_tokens: number | null;
  tools_used: string[];
  tool_call_count: number | null;
  turn_count: number | null;
  first_edit_offset_seconds: number | null;
  retry_count: number | null;
  tests_passed_first_try: number | null;
  embedding: Buffer | null;
  embedding_model: string | null;
  paused_seconds: number | null;
  parent_task_id: string | null;
  parent_plan_id: string | null;
}

// --- v3: plan run + calibration row shapes ---

export interface PlanRunRow {
  id: string;
  created_at: string;
  plan_json: string;
  model_id: string | null;
  total_predicted_seconds: number | null;
  total_actual_seconds: number | null;
  completed_at: string | null;
}

export interface CalibrationRow {
  category: string;
  bucket: string;
  mean_log_error: number;
  var_log_error: number;
  n: number;
  updated_at: string | null;
}

// --- Tool input/output shapes ---

export interface PlanItem {
  category: Category;
  tags?: string[];
  description: string;
  estimated_files?: number;
  /** Optional pre-computed sentence embedding for semantic similarity. */
  embedding?: Float32Array;
  /** Indices of plan items this task depends on (must complete first). */
  depends_on?: number[];
}

export interface EstimateBreakdown {
  description: string;
  estimate: string;
  estimate_seconds: number;
  p25_seconds: number;
  median_seconds: number;
  p75_seconds: number;
  range: string;
  based_on: string;
  confidence: Confidence;
}

export interface StatsBreakdownItem {
  group: string;
  count: number;
  avg_duration: string;
  avg_duration_seconds: number;
  median_duration: string;
  median_duration_seconds: number;
  lines_per_minute: number | null;
}

export interface SimilarTask {
  task: Task;
  similarity: number;
  weight: number; // similarity * recency multiplier
}

export type InsightType = 'comparison' | 'trend' | 'pattern';

export interface Insight {
  type: InsightType;
  message: string;
  confidence: 'high' | 'medium' | 'low';
}

// --- Utility functions ---

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export function parseTask(row: TaskRow): Task {
  let tags: string[];
  try {
    tags = JSON.parse(row.tags || '[]') as string[];
  } catch {
    tags = [];
  }
  let tools_used: string[];
  try {
    tools_used = row.tools_used ? (JSON.parse(row.tools_used) as string[]) : [];
  } catch {
    tools_used = [];
  }
  return { ...row, tags, tools_used };
}

export function confidenceFromCount(n: number): Confidence {
  if (n >= 10) return 'high';
  if (n >= 3) return 'medium';
  if (n >= 1) return 'low';
  return 'none';
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const frac = idx - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}
