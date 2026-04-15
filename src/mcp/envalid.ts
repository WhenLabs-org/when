import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatOutput, writeCache, deriveProject, checkTriggers } from './run-cli.js';

export function registerEnvalidTools(server: McpServer): void {
  server.tool(
    'envalid_validate',
    'Validate .env files against their schema — catch missing or invalid environment variables',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      environment: z.string().optional().describe('Target environment (e.g. production, staging)'),
      format: z.enum(['terminal', 'json', 'markdown']).optional().describe('Output format'),
    },
    async ({ path, environment, format }) => {
      const args = ['validate'];
      if (environment) args.push('--environment', environment);
      if (format) args.push('--format', format);
      const result = await runCli('envalid', args, path);
      const output = formatOutput(result);
      writeCache('envalid_validate', deriveProject(path), output, result.code);
      const extras = await checkTriggers('envalid_validate', result, path);
      return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
    },
  );

  server.tool(
    'envalid_detect',
    'Scan codebase for env var usage and compare with schema — find undocumented env vars',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      format: z.enum(['terminal', 'json']).optional().describe('Output format'),
    },
    async ({ path, format }) => {
      const args = ['detect'];
      if (format) args.push('--format', format);
      const result = await runCli('envalid', args, path);
      const output = formatOutput(result);
      writeCache('envalid_detect', deriveProject(path), output, result.code);
      const extras = await checkTriggers('envalid_detect', result, path);
      return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
    },
  );

  server.tool(
    'envalid_init',
    'Generate .env.schema from an existing .env file — bootstrap type-safe env validation',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      force: z.coerce.boolean().optional().describe('Overwrite existing schema'),
    },
    async ({ path, force }) => {
      const args = ['init'];
      if (force) args.push('--force');
      const result = await runCli('envalid', args, path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'envalid_diff',
    'Compare two .env files — show added, removed, and changed variables',
    {
      source: z.string().describe('Path to source .env file'),
      target: z.string().describe('Path to target .env file'),
      schema: z.string().optional().describe('Path to .env.schema for sensitivity info'),
      format: z.enum(['terminal', 'json', 'markdown']).optional().describe('Output format'),
    },
    async ({ source, target, schema, format }) => {
      const args = ['diff', source, target];
      if (schema) args.push('--schema', schema);
      if (format) args.push('--format', format);
      const result = await runCli('envalid', args);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'envalid_sync',
    'Check multiple environment files against schema — ensure all envs are in sync',
    {
      environments: z.string().describe('Comma-separated env file paths (e.g. ".env,.env.staging,.env.production")'),
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      format: z.enum(['terminal', 'json', 'markdown']).optional().describe('Output format'),
    },
    async ({ environments, path, format }) => {
      const args = ['sync', '--environments', environments];
      if (format) args.push('--format', format);
      const result = await runCli('envalid', args, path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'envalid_generate',
    'Generate .env.example from schema — create a safe template without secrets',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      output: z.string().optional().describe('Output file path (default: .env.example)'),
    },
    async ({ path, output }) => {
      const args = ['generate-example'];
      if (output) args.push('--output', output);
      const result = await runCli('envalid', args, path);
      const outputText = formatOutput(result);
      return { content: [{ type: 'text' as const, text: outputText }] };
    },
  );

  server.tool(
    'envalid_secrets',
    'Scan committed files for leaked secrets — detect API keys, tokens, passwords in code',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      format: z.enum(['terminal', 'json']).optional().describe('Output format'),
    },
    async ({ path, format }) => {
      const args = ['secrets'];
      if (format) args.push('--format', format);
      const result = await runCli('envalid', args, path);
      const output = formatOutput(result);
      writeCache('envalid_secrets', deriveProject(path), output, result.code);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'envalid_generate_schema',
    'Generate .env.schema from code analysis — infer types, required-ness, and sensitivity from usage patterns',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      output: z.string().optional().describe('Output file path (default: .env.schema)'),
    },
    async ({ path, output }) => {
      const args = ['detect', '--generate'];
      if (output) args.push('-o', output);
      const result = await runCli('envalid', args, path);
      const outputText = formatOutput(result);
      return { content: [{ type: 'text' as const, text: outputText }] };
    },
  );

  server.tool(
    'envalid_hook_status',
    'Check if the envalid pre-commit git hook is installed',
    { path: z.string().optional().describe('Project directory (defaults to cwd)') },
    async ({ path }) => {
      const result = await runCli('envalid', ['hook', 'status'], path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );
}
