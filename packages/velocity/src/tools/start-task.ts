import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { TaskQueries } from '../db/queries.js';
import { CATEGORIES, parseTask, type SimilarTask } from '../types.js';
import { detectProject } from '../cli/detect-project.js';
import { estimateTaskWithFederation } from '../matching/similarity.js';
import { getDefaultEmbedder, taskEmbeddingText, tryEmbed } from '../matching/embedding.js';

export const RECENT_SIMILAR_LIMIT = 5;

export interface RecentSimilarEntry {
  description: string;
  duration_seconds: number | null;
  files_actual: number | null;
  tests_passed_first_try: boolean | null;
  status: string | null;
  notes: string | null;
  similarity: number;
  days_ago: number;
}

/** Map the SimilarTask[] produced by matching into the compact, agent-
 *  readable shape exposed on `velocity_start_task`'s response. Truncated
 *  to RECENT_SIMILAR_LIMIT; input ordering is preserved (expected: weight
 *  desc, as returned by findSimilarTasks). */
export function mapRecentSimilar(similar: SimilarTask[], now: number): RecentSimilarEntry[] {
  return similar.slice(0, RECENT_SIMILAR_LIMIT).map(s => ({
    description: s.task.description,
    duration_seconds: s.task.duration_seconds,
    files_actual: s.task.files_actual,
    tests_passed_first_try:
      s.task.tests_passed_first_try === 1 ? true
      : s.task.tests_passed_first_try === 0 ? false
      : null,
    status: s.task.status,
    notes: s.task.notes,
    similarity: Math.round(s.similarity * 1000) / 1000,
    days_ago: Math.round(((now - Date.parse(s.task.started_at)) / 86_400_000) * 10) / 10,
  }));
}

export function registerStartTask(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_start_task',
    [
      'Start a timer for a discrete coding task and, when historical data is available, return a duration estimate derived from similar past tasks.',
      '',
      'When to use: before starting any distinct unit of work — a bug fix, a feature, a refactor, a test-writing pass. Use one task per logical unit; do not batch unrelated changes under a single task. Always pair with `velocity_end_task` so the task row is closed and the dataset stays clean.',
      '',
      'Side effects: inserts a new row into the local SQLite database at ~/.velocity-mcp/tasks.db (override via HOME). Computes a best-effort duration prediction by querying historical rows of the same category/tags; predictions run locally and are cached per-task. Federated upload is disabled unless the user has explicitly opted in via `velocity-mcp federation enable`.',
      '',
      'Returns: JSON with `task_id` (pass this to `velocity_end_task`), `started_at` ISO timestamp, `message`, and — when enough historical data exists — a `prediction` block containing point estimate in seconds, p25/p75 range, confidence (low/medium/high), whether the estimate was calibrated, and whether it drew on federated data.',
    ].join('\n'),
    {
      task_id: z.string().optional().describe('Stable unique identifier for this task. Pass the same id later to `velocity_end_task`. Omit to have one auto-generated (UUID v4).'),
      category: z.enum(CATEGORIES).describe('High-level category of the work: scaffold, implement, refactor, debug, test, config, docs, or deploy. Used for historical matching — pick the closest fit rather than inventing new categories.'),
      description: z.string().describe('One-sentence description of the task, specific enough that semantic-similarity matching can find comparable historical tasks (e.g. "wire sqlite migrations into the startup path" beats "db work").'),
      tags: z.array(z.string()).optional().describe('Free-form tags that describe the technical surface area (e.g. ["typescript", "react", "sqlite"]). Reuse tags across sessions — consistency improves the quality of historical-similarity matches.'),
      estimated_files: z.number().int().positive().optional().describe('Your a-priori guess for how many files you expect to touch. Used both as a similarity signal and to compute an accuracy residual when `velocity_end_task` supplies `actual_files`.'),
      project: z.string().optional().describe('Project identifier (typically the repo name or directory basename). Auto-detected from the git remote or cwd if omitted.'),
      model_id: z.string().optional().describe('Identifier of the model running this task (e.g. "claude-opus-4-7"). Used to segment calibration residuals by model so predictions adapt to model-specific pacing.'),
      context_tokens: z.number().int().nonnegative().optional().describe('Approximate tokens already in the context window at task start. Stored as telemetry to correlate context pressure with task duration.'),
      parent_task_id: z.string().optional().describe('If this task is a sub-task spawned from another, pass the parent task\'s id here so the hierarchy is preserved.'),
      parent_plan_id: z.string().optional().describe('If this task is part of a larger plan being tracked as a unit, pass the plan run id so plan-level metrics can be sealed when the last task in the plan completes.'),
    },
    async (args) => {
      const taskId = args.task_id ?? uuidv4();
      const startedAt = new Date().toISOString();

      const existing = queries.getTask(taskId);
      if (existing) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Task '${taskId}' already exists` }) }],
          isError: true,
        };
      }

      const normalizedTags = (args.tags ?? []).map(t => t.trim().toLowerCase());

      queries.insertTask(
        taskId,
        args.category,
        normalizedTags,
        args.description,
        args.project ?? detectProject(),
        startedAt,
        args.estimated_files ?? null,
      );

      if (args.model_id != null || args.context_tokens != null || args.parent_task_id != null || args.parent_plan_id != null) {
        queries.updateTelemetry(taskId, {
          modelId: args.model_id ?? null,
          contextTokens: args.context_tokens ?? null,
          parentTaskId: args.parent_task_id ?? null,
          parentPlanId: args.parent_plan_id ?? null,
        });
      }

      // Compute and persist a prediction so the calibration loop can measure
      // residuals at end time. Predictions are best-effort — any failure is
      // swallowed, since the task is already started.
      let prediction: Awaited<ReturnType<typeof estimateTaskWithFederation>> | null = null;
      try {
        const historicalRows = queries.getCompletedByCategory(args.category);
        const historicalTasks = historicalRows.filter(r => r.id !== taskId).map(parseTask);
        const planEmbedding = await tryEmbed(
          getDefaultEmbedder(),
          taskEmbeddingText(args.description, normalizedTags),
        );
        prediction = await estimateTaskWithFederation(
          {
            category: args.category,
            tags: normalizedTags,
            description: args.description,
            estimated_files: args.estimated_files,
            embedding: planEmbedding ?? undefined,
          },
          historicalTasks,
          queries,
          args.model_id ?? null,
        );
        queries.setPrediction(taskId, {
          predictedDurationSeconds: prediction.seconds,
          predictedP25Seconds: prediction.p25_seconds,
          predictedP75Seconds: prediction.p75_seconds,
          predictedConfidence: prediction.confidence,
        });
      } catch {
        // Calibration is a nice-to-have; never block task start.
      }

      const result: Record<string, unknown> = {
        task_id: taskId,
        started_at: startedAt,
        message: `Timer started for task: ${args.description}`,
      };
      if (prediction) {
        result.prediction = {
          seconds: prediction.seconds,
          median_seconds: prediction.median_seconds,
          p25_seconds: prediction.p25_seconds,
          p75_seconds: prediction.p75_seconds,
          confidence: prediction.confidence,
          calibrated: prediction.calibrated,
          calibration_shift: prediction.calibration_shift,
          federated: Boolean(prediction.federated),
          federated_n: prediction.federated_n ?? null,
        };

        const similar = prediction.similar ?? [];
        if (similar.length > 0) {
          result.recent_similar = mapRecentSimilar(similar, Date.now());
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
