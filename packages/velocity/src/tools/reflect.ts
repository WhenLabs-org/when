import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskQueries } from '../db/queries.js';
import { generateReflectInsights } from '../matching/reflect.js';

export function registerReflect(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_reflect',
    'Generate agent-actionable insights from recent velocity telemetry: category/tag slowdowns, context-size effects, test-pass rates, failure clusters, model comparisons, and calibration status.',
    {
      scope: z.enum(['session', 'day', 'week']).describe("Time window: 'session' (last 4 h), 'day' (last 24 h), 'week' (last 7 days)."),
      project: z.string().optional().describe('Restrict to a single project. Defaults to all projects.'),
    },
    async (args) => {
      const insights = generateReflectInsights(queries, {
        scope: args.scope,
        project: args.project,
      });

      const result = {
        scope: args.scope,
        project: args.project ?? null,
        insight_count: insights.length,
        insights,
        summary: insights.length === 0
          ? `No actionable patterns found in the last ${args.scope}. Keep coding — more data will sharpen the signal.`
          : `${insights.length} pattern${insights.length === 1 ? '' : 's'} observed in the last ${args.scope}.`,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
