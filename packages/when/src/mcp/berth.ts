import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTool as createBerthTool } from '@whenlabs/berth';
import { runCli, formatOutput, writeCache, deriveProject, checkTriggers } from './run-cli.js';
import { registerScanTool } from './register-scan-tool.js';

export function registerBerthTools(server: McpServer): void {
  const berth = createBerthTool();

  registerScanTool(server, {
    name: 'berth_status',
    description: 'Show all active ports, Docker ports, and configured ports — diagnose port conflicts',
    tool: berth,
  });

  registerScanTool(server, {
    name: 'berth_check',
    description: 'Scan a project directory for port conflicts before starting dev servers',
    tool: berth,
  });

  server.tool(
    'berth_kill',
    'Kill processes on a specific port — free up a port for your dev server',
    {
      port: z.coerce.number().optional().describe('Port number to free'),
      dev: z.coerce.boolean().optional().describe('Kill all dev processes (node, python, ruby, etc.)'),
    },
    async ({ port, dev }) => {
      const args = ['kill'];
      if (port) args.push(String(port));
      if (dev) args.push('--dev');
      args.push('--force'); // skip confirmation in MCP context
      const result = await runCli('berth', args);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'berth_free',
    'Free all ports for a registered project — kill every process blocking the project',
    { project: z.string().describe('Registered project name') },
    async ({ project }) => {
      const result = await runCli('berth', ['free', project]);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'berth_register',
    'Register a project directory\'s port requirements for conflict tracking',
    {
      path: z.string().optional().describe('Project directory to register (defaults to cwd)'),
    },
    async ({ path }) => {
      const args = ['register', '--yes']; // skip confirmation
      if (path) args.push('--dir', path);
      const result = await runCli('berth', args);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'berth_list',
    'List all registered projects and their port statuses',
    {},
    async () => {
      const result = await runCli('berth', ['list', '--json']);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'berth_reassign',
    'Change a port assignment in project config files (docker-compose, .env, etc.)',
    {
      oldPort: z.number().describe('Current port number'),
      newPort: z.number().describe('New port number'),
      project: z.string().optional().describe('Project name from registry'),
      dryRun: z.coerce.boolean().optional().describe('Show which files would change without writing them'),
    },
    async ({ oldPort, newPort, project, dryRun }) => {
      const args = ['reassign', String(oldPort), String(newPort)];
      if (project) args.push('--project', project);
      if (dryRun) args.push('--dry-run');
      const result = await runCli('berth', args);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'berth_start',
    'Auto-resolve all port conflicts and prepare a project to start cleanly',
    {
      project: z.string().describe('Registered project name'),
      dryRun: z.coerce.boolean().optional().describe('Show what would be done without making changes'),
    },
    async ({ project, dryRun }) => {
      const args = ['start', project];
      if (dryRun) args.push('--dry-run');
      const result = await runCli('berth', args);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'berth_resolve',
    'Auto-resolve port conflicts — detect conflicts and fix via kill or reassign strategy',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      strategy: z.enum(['kill', 'reassign', 'auto']).optional().describe('Resolution strategy (default: auto)'),
      kill: z.coerce.boolean().optional().describe('Allow killing processes (required for kill/auto strategies)'),
      dryRun: z.coerce.boolean().optional().describe('Show what would be done without making changes'),
    },
    async ({ path, strategy, kill, dryRun }) => {
      const args = ['resolve'];
      if (strategy) args.push('--strategy', strategy);
      if (kill) args.push('--kill');
      if (dryRun) args.push('--dry-run');
      const result = await runCli('berth', args, path);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'berth_predict',
    'Predict port conflicts from project config files before starting — dry-run conflict check',
    { path: z.string().optional().describe('Project directory (defaults to cwd)') },
    async ({ path }) => {
      const result = await runCli('berth', ['predict', path || '.']);
      const output = formatOutput(result);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );

  server.tool(
    'berth_auto_resolve',
    'Check for port conflicts and auto-resolve them',
    {
      path: z.string().optional().describe('Project directory (defaults to cwd)'),
      strategy: z.enum(['kill', 'reassign', 'auto']).optional().describe('Resolution strategy (default: auto)'),
    },
    async ({ path, strategy }) => {
      const checkResult = await runCli('berth', ['check', path || '.']);
      const checkOutput = formatOutput(checkResult);
      writeCache('berth_check', deriveProject(path), checkOutput, checkResult.code);

      const hasConflicts = /conflict/i.test(checkOutput);
      if (hasConflicts) {
        const resolveArgs = ['resolve', '--strategy', strategy || 'auto', '--kill'];
        const resolveResult = await runCli('berth', resolveArgs, path);
        const resolveOutput = formatOutput(resolveResult);
        const combined = `${checkOutput}\n--- Auto-resolve applied ---\n${resolveOutput}`;
        return { content: [{ type: 'text' as const, text: combined }] };
      }

      return { content: [{ type: 'text' as const, text: checkOutput }] };
    },
  );
}
