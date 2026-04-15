import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { TaskQueries } from '../db/queries.js';
import { CATEGORIES } from '../types.js';

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
        args.project ?? null,
        startedAt,
        args.estimated_files ?? null,
      );

      const result = {
        task_id: taskId,
        started_at: startedAt,
        message: `Timer started for task: ${args.description}`,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
