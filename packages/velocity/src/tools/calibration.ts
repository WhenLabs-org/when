import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { TaskQueries } from '../db/queries.js';
import { MIN_CALIBRATION_N } from '../matching/calibration.js';

export function registerCalibration(server: McpServer, queries: TaskQueries): void {
  server.tool(
    'velocity_calibration',
    'Inspect the calibration table — per-bucket mean/stddev of log-residuals. Useful for verifying that predictions are converging and for debugging estimator bias.',
    {
      min_samples: z.number().int().nonnegative().optional()
        .describe(`Only return buckets with at least this many samples (default ${MIN_CALIBRATION_N}).`),
    },
    async (args) => {
      const min = args.min_samples ?? MIN_CALIBRATION_N;
      const rows = queries.listCalibration();
      const buckets = rows
        .filter(r => r.n >= min)
        .map(r => {
          const shift = Math.exp(r.mean_log_error);
          const stddev = Math.sqrt(Math.max(0, r.var_log_error));
          return {
            category: r.category,
            bucket: r.bucket,
            samples: r.n,
            mean_log_error: Number(r.mean_log_error.toFixed(4)),
            stddev_log_error: Number(stddev.toFixed(4)),
            shift_factor: Number(shift.toFixed(3)),
            shift_pct: Number((100 * (shift - 1)).toFixed(1)),
            updated_at: r.updated_at,
          };
        });

      const result = {
        min_samples: min,
        bucket_count: buckets.length,
        buckets,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
