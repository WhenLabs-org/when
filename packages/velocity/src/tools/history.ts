import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskQueries } from '../db/queries.js';
import { CATEGORIES, STATUSES, parseTask, formatDuration } from '../types.js';
import type { Category, TaskStatus } from '../types.js';

export function registerHistory(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_history',
    'View recent task records with full metadata.',
    {
      limit: z.number().int().positive().default(20).optional(),
      filter_category: z.enum(CATEGORIES).optional(),
      filter_status: z.enum(STATUSES).optional(),
    },
    async (args) => {
      const limit = args.limit ?? 20;
      const rows = queries.getHistory(
        limit,
        args.filter_category as Category | undefined,
        args.filter_status as TaskStatus | undefined,
      );

      const tasks = rows.map(row => {
        const t = parseTask(row);
        // Strip the raw embedding buffer — it's a ~1.5KB byte array per task
        // that blows up MCP output size and is never useful to a caller.
        const { embedding: _embedding, ...rest } = t;
        return {
          ...rest,
          duration_human: t.duration_seconds != null ? formatDuration(t.duration_seconds) : null,
        };
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
    },
  );
}
