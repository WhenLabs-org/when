import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskQueries } from '../db/queries.js';
import { CATEGORIES, formatDuration, parseTask } from '../types.js';
import { estimateTask } from '../matching/similarity.js';
import type { Confidence, EstimateBreakdown } from '../types.js';

export function registerEstimate(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_estimate',
    'Estimate how long a multi-step plan will take based on historical performance.',
    {
      plan: z.array(z.object({
        category: z.enum(CATEGORIES),
        tags: z.array(z.string()).optional(),
        description: z.string(),
        estimated_files: z.number().int().positive().optional(),
      })).min(1).describe('List of planned tasks to estimate'),
    },
    async (args) => {
      const breakdown: EstimateBreakdown[] = [];
      let totalSeconds = 0;
      const confidenceReasons: string[] = [];
      let minConfidence: Confidence = 'high';
      const confOrder: Confidence[] = ['none', 'low', 'medium', 'high'];

      for (const planItem of args.plan) {
        const historicalRows = queries.getCompletedByCategory(planItem.category);
        const historicalTasks = historicalRows.map(parseTask);
        const est = estimateTask(planItem, historicalTasks);

        totalSeconds += est.seconds;

        breakdown.push({
          description: planItem.description,
          estimate: formatDuration(est.seconds),
          estimate_seconds: Math.round(est.seconds),
          based_on: est.matchCount > 0 ? `${est.matchCount} similar tasks` : 'heuristic (no history)',
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

      const totalMatchCount = breakdown.reduce((s, b) => {
        const n = parseInt(b.based_on) || 0;
        return s + n;
      }, 0);

      const confidenceReason = confidenceReasons.length > 0
        ? `Based on historical data. ${confidenceReasons.join('. ')}.`
        : `Based on ${totalMatchCount} similar tasks across ${args.plan.length} categories.`;

      const result = {
        total_estimate: formatDuration(totalSeconds),
        total_seconds: Math.round(totalSeconds),
        confidence: minConfidence,
        confidence_reason: confidenceReason,
        breakdown,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
