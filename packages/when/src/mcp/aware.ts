import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatOutput, writeCache, deriveProject } from './run-cli.js';

export function registerAwareTools(server: McpServer): void {
  server.tool(
    'aware_sync',
    'Detect stack and regenerate AI context files (CLAUDE.md, .cursorrules, etc.) from .aware.json',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      dryRun: z.coerce.boolean().optional().describe('Show what would change without writing files'),
    },
    async ({ path, dryRun }) => {
      const args = ['sync'];
      if (dryRun) args.push('--dry-run');
      const result = await runCli('aware', args, path);
      const output = formatOutput(result);
      writeCache('aware_sync', deriveProject(path), output, result.code);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );
}
