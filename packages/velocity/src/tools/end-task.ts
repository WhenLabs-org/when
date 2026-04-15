import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskQueries } from '../db/queries.js';
import { STATUSES, formatDuration, parseTask } from '../types.js';
import { findSimilarTasks, weightedMedian } from '../matching/similarity.js';

export function registerEndTask(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_end_task',
    'Stop timing a task and record the result.',
    {
      task_id: z.string().describe('The task ID to end'),
      status: z.enum(STATUSES).describe('Outcome of the task'),
      actual_files: z.number().int().nonnegative().optional().describe('Files actually modified'),
      notes: z.string().optional().describe('Additional context'),
    },
    async (args) => {
      const row = queries.getActiveTask(args.task_id);
      if (!row) {
        const exists = queries.getTask(args.task_id);
        const msg = exists
          ? `Task '${args.task_id}' has already ended`
          : `Task '${args.task_id}' not found`;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }

      const endedAt = new Date().toISOString();
      const durationSeconds = Math.max(0, (new Date(endedAt).getTime() - new Date(row.started_at).getTime()) / 1000);

      queries.endTask(args.task_id, endedAt, durationSeconds, args.status, args.actual_files ?? null, args.notes ?? null);

      let message = `Task ${args.status} in ${formatDuration(durationSeconds)}.`;

      if (args.status === 'completed') {
        const task = parseTask(row);
        const historicalRows = queries.getCompletedByCategory(task.category);
        const historicalTasks = historicalRows
          .filter(r => r.id !== args.task_id)
          .map(parseTask);

        if (historicalTasks.length > 0) {
          const similar = findSimilarTasks(
            { category: task.category, tags: task.tags, description: task.description, estimated_files: task.files_estimated ?? undefined },
            historicalTasks,
          );
          if (similar.length > 0) {
            const historicalMedian = weightedMedian(similar);
            if (historicalMedian > 0) {
              const diff = ((durationSeconds - historicalMedian) / historicalMedian) * 100;
              const tagStr = task.tags.length > 0 ? ` + ${task.tags.join(', ')}` : '';
              if (diff < -5) {
                message += ` Historical avg for '${task.category}${tagStr}': ${formatDuration(historicalMedian)} — you were ${Math.abs(Math.round(diff))}% faster.`;
              } else if (diff > 5) {
                message += ` Historical avg for '${task.category}${tagStr}': ${formatDuration(historicalMedian)} — this was ${Math.round(diff)}% slower.`;
              } else {
                message += ` Right on pace with historical avg of ${formatDuration(historicalMedian)}.`;
              }
            }
          }
        }
      }

      const result = {
        task_id: args.task_id,
        duration_seconds: Math.round(durationSeconds * 10) / 10,
        duration_human: formatDuration(durationSeconds),
        category: row.category,
        tags: JSON.parse(row.tags || '[]'),
        message,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
