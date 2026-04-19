import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { TaskQueries } from '../db/queries.js';
import { CATEGORIES, formatDuration, parseTask } from '../types.js';
import { estimateTaskWithFederation } from '../matching/similarity.js';
import { getDefaultEmbedder, taskEmbeddingText, tryEmbed } from '../matching/embedding.js';
import {
  computePlanTotal,
  readParams,
  type PlanTaskInput,
  type StoredPlanJson,
} from '../matching/plan-model.js';
import type { Confidence, EstimateBreakdown } from '../types.js';

export function registerEstimate(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_estimate',
    'Estimate how long a multi-step plan will take based on historical performance. Persists a plan_run so actuals can refit the plan-level model.',
    {
      plan: z.array(z.object({
        category: z.enum(CATEGORIES),
        tags: z.array(z.string()).optional(),
        description: z.string(),
        estimated_files: z.number().int().positive().optional(),
        depends_on: z.array(z.number().int().nonnegative()).optional()
          .describe('Indices of earlier plan items this task depends on (enables critical-path instead of sum).'),
      })).min(1).describe('List of planned tasks to estimate'),
      model_id: z.string().optional().describe('Model running the plan (used for calibration bucketing)'),
    },
    async (args) => {
      const breakdown: EstimateBreakdown[] = [];
      const perTask: PlanTaskInput[] = [];
      let sumTaskSeconds = 0;
      let totalMatchCount = 0;
      let anyCalibrated = false;
      let anyFederated = false;
      const confidenceReasons: string[] = [];
      let minConfidence: Confidence = 'high';
      const confOrder: Confidence[] = ['none', 'low', 'medium', 'high'];

      for (const planItem of args.plan) {
        const historicalRows = queries.getCompletedByCategory(planItem.category);
        const historicalTasks = historicalRows.map(parseTask);
        const planEmbedding = await tryEmbed(
          getDefaultEmbedder(),
          taskEmbeddingText(planItem.description, planItem.tags ?? []),
        );
        const est = await estimateTaskWithFederation(
          { ...planItem, embedding: planEmbedding ?? undefined },
          historicalTasks,
          queries,
          args.model_id ?? null,
        );
        if (est.calibrated) anyCalibrated = true;
        if (est.federated) anyFederated = true;

        sumTaskSeconds += est.seconds;
        totalMatchCount += est.matchCount;
        perTask.push({
          seconds: est.seconds,
          depends_on: planItem.depends_on,
          category: planItem.category,
        });

        const range = est.matchCount > 0
          ? `${formatDuration(est.p25_seconds)}-${formatDuration(est.p75_seconds)} (p25-p75), median ${formatDuration(est.median_seconds)}`
          : `~${formatDuration(est.seconds)} (heuristic)`;

        breakdown.push({
          description: planItem.description,
          estimate: formatDuration(est.seconds),
          estimate_seconds: Math.round(est.seconds),
          p25_seconds: Math.round(est.p25_seconds),
          median_seconds: Math.round(est.median_seconds),
          p75_seconds: Math.round(est.p75_seconds),
          range,
          based_on: est.matchCount > 0 ? `Based on ${est.matchCount} similar tasks: ${range}` : 'heuristic (no history)',
          confidence: est.confidence,
        });

        if (confOrder.indexOf(est.confidence) < confOrder.indexOf(minConfidence)) {
          minConfidence = est.confidence;
        }

        if (est.confidence === 'low' || est.confidence === 'none') {
          const tagStr = planItem.tags?.length ? ' + ' + planItem.tags.join(', ') : '';
          confidenceReasons.push(
            `'${planItem.category}${tagStr}' has ${est.confidence === 'none' ? 'no' : 'limited'} sample data (${est.matchCount})`,
          );
        }
      }

      // Plan-level adjustment: context-switch overhead + debug tail. Uses the
      // latest fit of (k1, k2) from completed plan_runs; defaults to (0, 0)
      // until we've seen enough plans to fit.
      const params = readParams(queries);
      const totals = computePlanTotal(perTask, params);

      // Persist plan_run so actuals can refit the model later.
      const planRunId = uuidv4();
      const storedPlan: StoredPlanJson = {
        items: args.plan.map((p, i) => ({
          category: p.category,
          depends_on: p.depends_on,
          estimate_seconds: Math.round(perTask[i].seconds),
        })),
        sum_task_seconds: Math.round(sumTaskSeconds),
        critical_path_seconds: Math.round(totals.critical_path_seconds),
      };
      try {
        queries.insertPlanRun(
          planRunId,
          new Date().toISOString(),
          JSON.stringify(storedPlan),
          args.model_id ?? null,
          Math.round(totals.total_seconds),
        );
      } catch (err) {
        // Never fail the estimate because of a persistence issue.
        process.stderr.write(`velocity-mcp: plan_run insert failed: ${(err as Error).message}\n`);
      }

      const confidenceReason = confidenceReasons.length > 0
        ? `Based on historical data. ${confidenceReasons.join('. ')}.`
        : `Based on ${totalMatchCount} similar tasks across ${args.plan.length} categories.`;

      const result: Record<string, unknown> = {
        plan_run_id: planRunId,
        total_estimate: formatDuration(totals.total_seconds),
        total_seconds: Math.round(totals.total_seconds),
        sum_task_seconds: Math.round(totals.sum_task_seconds),
        critical_path_seconds: Math.round(totals.critical_path_seconds),
        overhead_seconds: Math.round(totals.overhead_seconds),
        debug_tail_seconds: Math.round(totals.debug_tail_seconds),
        has_dependencies: totals.has_dependencies,
        debug_count: totals.debug_count,
        plan_model: {
          k1: Number(params.k1.toFixed(2)),
          k2: Number(params.k2.toFixed(2)),
          n_observations: params.n_observations,
        },
        confidence: minConfidence,
        confidence_reason: confidenceReason,
        calibrated: anyCalibrated,
        federated: anyFederated,
        breakdown,
      };
      if (totals.cycles.length > 0) {
        result.warnings = [
          `depends_on graph contains ${totals.cycles.length} cycle(s): ${
            totals.cycles.map(c => `[${c.join('→')}]`).join(', ')
          }. Cycle back-edges are treated as 0 — fix the plan or the estimate will be low.`,
        ];
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
