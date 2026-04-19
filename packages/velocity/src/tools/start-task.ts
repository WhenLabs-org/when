import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { TaskQueries } from '../db/queries.js';
import { CATEGORIES, parseTask } from '../types.js';
import { detectProject } from '../cli/detect-project.js';
import { estimateTaskWithFederation } from '../matching/similarity.js';
import { getDefaultEmbedder, taskEmbeddingText, tryEmbed } from '../matching/embedding.js';

export function registerStartTask(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_start_task',
    'Begin timing a coding task. Call this before starting any discrete unit of work.',
    {
      task_id: z.string().optional().describe('Unique task ID (auto-generated if omitted)'),
      category: z.enum(CATEGORIES).describe('Task category'),
      description: z.string().describe('Short description of the task'),
      tags: z.array(z.string()).optional().describe('Free-form tags for matching (e.g. typescript, react)'),
      estimated_files: z.number().int().positive().optional().describe('Expected number of files to touch'),
      project: z.string().optional().describe('Project identifier'),
      model_id: z.string().optional().describe('The model running this task (e.g. claude-opus-4-7)'),
      context_tokens: z.number().int().nonnegative().optional().describe('Approximate context window size at task start'),
      parent_task_id: z.string().optional().describe('ID of a parent task this is a sub-task of'),
      parent_plan_id: z.string().optional().describe('ID of the plan run this task belongs to'),
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
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
