import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTool as createVowTool } from '@whenlabs/vow';
import { runCli, formatOutput, writeCache, deriveProject, checkTriggers } from './run-cli.js';
import { registerScanTool } from './register-scan-tool.js';

export function registerVowTools(server: McpServer): void {
  const vow = createVowTool();

  registerScanTool(server, {
    name: 'vow_scan',
    description: 'Scan dependency licenses — summarize all licenses in the project',
    tool: vow,
    extraSchema: {
      production: z.coerce.boolean().optional().describe('Skip devDependencies'),
    },
    buildOptions: ({ production, format }) => ({ production, format }),
  });

  server.tool(
    'vow_check',
    'Validate dependency licenses against policy — flag violations before release',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      production: z.coerce.boolean().optional().describe('Skip devDependencies'),
    },
    async ({ path, production }) => {
      const args = ['check'];
      if (production) args.push('--production');
      const result = await runCli('vow', args, path);
      const output = formatOutput(result);
      writeCache('vow_check', deriveProject(path), output, result.code);
      const extras = await checkTriggers('vow_check', result, path);
      return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
    },
  );

  server.tool(
    'vow_init',
    'Generate a license policy file (.vow.json) — choose from commercial, opensource, or strict templates',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      template: z.enum(['commercial', 'opensource', 'strict']).optional().describe('Policy template'),
    },
    async ({ path, template }) => {
      const args = ['init'];
      if (template) args.push('--template', template);
      const result = await runCli('vow', args, path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'vow_tree',
    'Display dependency tree with license annotations — trace license inheritance',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      filter: z.string().optional().describe('Show only subtrees containing this license (e.g. "GPL")'),
      depth: z.coerce.number().optional().describe('Max tree depth'),
      production: z.coerce.boolean().optional().describe('Skip devDependencies'),
    },
    async ({ path, filter, depth, production }) => {
      const args = ['tree'];
      if (path) args.push('--path', path);
      if (filter) args.push('--filter', filter);
      if (depth) args.push('--depth', String(depth));
      if (production) args.push('--production');
      const result = await runCli('vow', args, path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'vow_fix',
    'Suggest alternative packages for license policy violations — find compliant replacements',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      production: z.coerce.boolean().optional().describe('Skip devDependencies'),
      limit: z.coerce.number().optional().describe('Max alternatives per package'),
    },
    async ({ path, production, limit }) => {
      const args = ['fix'];
      if (path) args.push('--path', path);
      if (production) args.push('--production');
      if (limit) args.push('--limit', String(limit));
      const result = await runCli('vow', args, path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'vow_export',
    'Export full license report as JSON, CSV, or Markdown',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      format: z.enum(['json', 'csv', 'markdown']).optional().describe('Export format (default: json)'),
      output: z.string().optional().describe('Output file path'),
      production: z.coerce.boolean().optional().describe('Skip devDependencies'),
    },
    async ({ path, format, output, production }) => {
      const args = ['export'];
      if (path) args.push('--path', path);
      if (format) args.push('--format', format);
      if (output) args.push('--output', output);
      if (production) args.push('--production');
      const result = await runCli('vow', args, path);
      const outputText = formatOutput(result);
      return { content: [{ type: 'text' as const, text: outputText }] };
    },
  );

  server.tool(
    'vow_hook_install',
    'Install a pre-commit git hook that checks dependency licenses before each commit',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
    },
    async ({ path }) => {
      const result = await runCli('vow', ['hook', 'install'], path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'vow_hook_uninstall',
    'Remove the vow pre-commit license check hook',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
    },
    async ({ path }) => {
      const result = await runCli('vow', ['hook', 'uninstall'], path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'vow_hook_status',
    'Check if the vow pre-commit license check hook is installed',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
    },
    async ({ path }) => {
      const result = await runCli('vow', ['hook', 'status'], path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'vow_attribution',
    'Generate THIRD_PARTY_LICENSES.md — list all dependencies with their licenses for compliance',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      output: z.string().optional().describe('Output file (default: THIRD_PARTY_LICENSES.md)'),
      production: z.coerce.boolean().optional().describe('Skip devDependencies'),
    },
    async ({ path, output, production }) => {
      const args = ['attribution'];
      if (path) args.push('--path', path);
      if (output) args.push('--output', output);
      if (production) args.push('--production');
      const result = await runCli('vow', args, path);
      const outputText = formatOutput(result);
      return { content: [{ type: 'text' as const, text: outputText }] };
    },
  );
}
