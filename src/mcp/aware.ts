import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatOutput, writeCache, deriveProject, checkTriggers } from './run-cli.js';

export function registerAwareTools(server: McpServer): void {
  server.tool(
    'aware_init',
    'Auto-detect project stack and generate AI context files (CLAUDE.md, .cursorrules, etc.)',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      targets: z.string().optional().describe('Comma-separated targets: claude,cursor,copilot,agents,all'),
      force: z.coerce.boolean().optional().describe('Overwrite existing files without prompting'),
    },
    async ({ path, targets, force }) => {
      const args = ['init'];
      if (targets) args.push('--targets', targets);
      if (force) args.push('--force');
      const result = await runCli('aware', args, path);
      const output = formatOutput(result);
      writeCache('aware_init', deriveProject(path), output, result.code);
      const extras = await checkTriggers('aware_init', result, path);
      return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
    },
  );

  server.tool(
    'aware_sync',
    'Regenerate AI context files from .aware.json — update CLAUDE.md, .cursorrules, etc.',
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

  server.tool(
    'aware_diff',
    'Show project changes since last sync — see what drifted in your codebase',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      exitCode: z.coerce.boolean().optional().describe('Return exit code 1 if changes detected (useful for CI)'),
    },
    async ({ path, exitCode }) => {
      const args = ['diff'];
      if (exitCode) args.push('--exit-code');
      const result = await runCli('aware', args, path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'aware_validate',
    'Validate .aware.json schema and content — check for config errors',
    { path: z.string().optional().describe('Project directory (defaults to cwd)') },
    async ({ path }) => {
      const result = await runCli('aware', ['validate'], path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'aware_doctor',
    'Diagnose project health — check config issues, stack drift, stale AI context files',
    { path: z.string().optional().describe('Project directory (defaults to cwd)') },
    async ({ path }) => {
      const result = await runCli('aware', ['doctor'], path);
      const output = formatOutput(result);
      writeCache('aware_doctor', deriveProject(path), output, result.code);
      const extras = await checkTriggers('aware_doctor', result, path);
      return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
    },
  );

  server.tool(
    'aware_add',
    'Add a rule, convention, or structure entry to .aware.json',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      type: z.enum(['rule', 'convention', 'structure']).describe('Type to add'),
    },
    async ({ path, type }) => {
      const args = ['add', '--type', type];
      const result = await runCli('aware', args, path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'aware_auto_sync',
    'Diagnose project health and auto-sync stale AI context files',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
    },
    async ({ path }) => {
      const doctorResult = await runCli('aware', ['doctor'], path);
      const doctorOutput = formatOutput(doctorResult);
      writeCache('aware_doctor', deriveProject(path), doctorOutput, doctorResult.code);

      const needsSync = /stale|outdated|drift/i.test(doctorOutput);
      if (needsSync) {
        const syncResult = await runCli('aware', ['sync'], path);
        const syncOutput = formatOutput(syncResult);
        const combined = `${doctorOutput}\n--- Auto-sync applied ---\n${syncOutput}`;
        return { content: [{ type: 'text' as const, text: combined }] };
      }

      return { content: [{ type: 'text' as const, text: doctorOutput }] };
    },
  );
}
