import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskQueries } from '../db/queries.js';
import { CATEGORIES, GROUP_BY_OPTIONS, formatDuration, parseTask, median } from '../types.js';
import type { Task, StatsBreakdownItem } from '../types.js';

export function registerStats(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_stats',
    'Query aggregate performance statistics grouped by category, tag, project, day, or week.',
    {
      group_by: z.enum(GROUP_BY_OPTIONS).describe('How to group results'),
      filter_category: z.enum(CATEGORIES).optional(),
      filter_tag: z.string().optional(),
      filter_project: z.string().optional(),
      last_n_days: z.number().int().positive().default(30).optional(),
    },
    async (args) => {
      const days = args.last_n_days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const rows = queries.getCompletedInRange(since);
      let tasks: Task[] = rows.map(parseTask);

      if (args.filter_category) {
        tasks = tasks.filter(t => t.category === args.filter_category);
      }
      if (args.filter_tag) {
        tasks = tasks.filter(t => t.tags.includes(args.filter_tag!));
      }
      if (args.filter_project) {
        tasks = tasks.filter(t => t.project === args.filter_project);
      }

      const groups = new Map<string, Task[]>();

      for (const task of tasks) {
        let keys: string[];
        switch (args.group_by) {
          case 'category':
            keys = [task.category];
            break;
          case 'tag':
            keys = task.tags.length > 0 ? task.tags : ['untagged'];
            break;
          case 'project':
            keys = [task.project ?? 'no-project'];
            break;
          case 'day':
            keys = [task.started_at.slice(0, 10)];
            break;
          case 'week': {
            const d = new Date(task.started_at);
            const dayOfWeek = d.getUTCDay();
            const weekStart = new Date(d);
            weekStart.setUTCDate(d.getUTCDate() - dayOfWeek);
            keys = [`week of ${weekStart.toISOString().slice(0, 10)}`];
            break;
          }
        }
        for (const key of keys) {
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(task);
        }
      }

      const breakdown: StatsBreakdownItem[] = [];
      for (const [group, groupTasks] of groups) {
        const durations = groupTasks
          .map(t => t.duration_seconds)
          .filter((d): d is number => d != null);
        const avg = durations.length > 0
          ? durations.reduce((s, d) => s + d, 0) / durations.length
          : 0;
        const med = median(durations);

        breakdown.push({
          group,
          count: groupTasks.length,
          avg_duration: formatDuration(avg),
          avg_duration_seconds: Math.round(avg),
          median_duration: formatDuration(med),
          median_duration_seconds: Math.round(med),
        });
      }

      breakdown.sort((a, b) => b.count - a.count);

      const totalTime = tasks.reduce((s, t) => s + (t.duration_seconds ?? 0), 0);
      const result = {
        period: `last ${days} days`,
        total_tasks: tasks.length,
        total_time: formatDuration(totalTime),
        total_time_seconds: Math.round(totalTime),
        breakdown,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
