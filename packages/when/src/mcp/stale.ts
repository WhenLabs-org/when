import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTool as createStaleTool } from '@whenlabs/stale';
import { runCli, formatOutput, writeCache, deriveProject, checkTriggers } from './run-cli.js';
import { registerScanTool } from './register-scan-tool.js';

export function registerStaleTools(server: McpServer): void {
  const stale = createStaleTool();

  registerScanTool(server, {
    name: 'stale_scan',
    description: 'Scan for documentation drift — detect when docs say one thing and code says another',
    tool: stale,
    cacheName: 'stale',
    formatValues: ['terminal', 'json', 'markdown', 'sarif'],
    coerceFormat: (f) => (f === 'sarif' ? 'json' : (f as 'terminal' | 'json' | 'markdown' | undefined)),
    extraSchema: {
      deep: z.coerce.boolean().optional().describe('Enable AI-powered deep analysis'),
      git: z.coerce.boolean().optional().describe('Enable git history staleness checks'),
    },
    buildOptions: ({ deep, git }) => ({ deep, git }),
  });

  server.tool(
    'stale_fix',
    'Auto-fix documentation drift — generate fixes for wrong file paths, dead links, phantom env vars, outdated scripts',
    {
      path: z.string().optional().describe('Project directory to scan (defaults to cwd)'),
      format: z.enum(['terminal', 'diff']).optional().describe('Output format (default: terminal)'),
      apply: z.coerce.boolean().optional().describe('Apply high-confidence fixes directly'),
      dryRun: z.coerce.boolean().optional().describe('Show what --apply would do without writing'),
    },
    async ({ path, format, apply, dryRun }) => {
      const args = ['fix'];
      if (format) args.push('--format', format);
      if (apply) args.push('--apply');
      if (dryRun) args.push('--dry-run');
      const result = await runCli('stale', args, path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'stale_init',
    'Generate a .stale.yml config file for customizing documentation drift detection',
    { path: z.string().optional().describe('Project directory (defaults to cwd)') },
    async ({ path }) => {
      const result = await runCli('stale', ['init'], path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'stale_auto_fix',
    'Scan for documentation drift and auto-fix high-confidence issues in one step',
    {
      path: z.string().optional().describe('Project directory to scan (defaults to cwd)'),
      deep: z.coerce.boolean().optional().describe('Enable AI-powered deep analysis'),
    },
    async ({ path, deep }) => {
      const scanArgs = ['scan'];
      if (deep) scanArgs.push('--deep');
      const scanResult = await runCli('stale', scanArgs, path);
      const scanOutput = formatOutput(scanResult);
      writeCache('stale_scan', deriveProject(path), scanOutput, scanResult.code);
      writeCache('stale_auto_fix', deriveProject(path), scanOutput, scanResult.code);

      if (scanResult.code !== 0) {
        const fixResult = await runCli('stale', ['fix', '--apply'], path);
        const fixOutput = formatOutput(fixResult);
        const combined = `${scanOutput}\n--- Auto-fix applied ---\n${fixOutput}`;
        writeCache('stale_auto_fix', deriveProject(path), combined, fixResult.code);
        return { content: [{ type: 'text' as const, text: combined }] };
      }

      return { content: [{ type: 'text' as const, text: scanOutput }] };
    },
  );
}
