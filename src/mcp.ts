import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findBin(name: string): string {
  const pkgRoot = resolve(__dirname, '..');
  const localBin = resolve(pkgRoot, 'node_modules', '.bin', name);
  if (existsSync(localBin)) return localBin;
  return name;
}

function runCli(bin: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((res) => {
    const child = spawn(findBin(bin), args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => res({ stdout, stderr: err.message, code: 1 }));
    child.on('close', (code) => res({ stdout, stderr, code: code ?? 0 }));
  });
}

const server = new McpServer({
  name: 'whenlabs',
  version: '0.1.0',
});

// --- stale ---
server.tool(
  'stale_scan',
  'Scan for documentation drift — detect when docs say one thing and code says another',
  { path: z.string().optional().describe('Project directory to scan (defaults to cwd)') },
  async ({ path }) => {
    const args = ['scan', '--no-color'];
    const result = await runCli('stale', args, path);
    return { content: [{ type: 'text' as const, text: result.stdout || result.stderr || 'No output' }] };
  },
);

// --- envalid ---
server.tool(
  'envalid_validate',
  'Validate .env files against their schema — catch missing or invalid environment variables',
  { path: z.string().optional().describe('Project directory (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('envalid', ['validate'], path);
    return { content: [{ type: 'text' as const, text: result.stdout || result.stderr || 'No output' }] };
  },
);

server.tool(
  'envalid_detect',
  'Scan codebase for env var usage and compare with schema — find undocumented env vars',
  { path: z.string().optional().describe('Project directory (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('envalid', ['detect'], path);
    return { content: [{ type: 'text' as const, text: result.stdout || result.stderr || 'No output' }] };
  },
);

// --- berth ---
server.tool(
  'berth_status',
  'Show all active ports, Docker ports, and configured ports — diagnose port conflicts',
  {},
  async () => {
    const result = await runCli('berth', ['status', '--json']);
    return { content: [{ type: 'text' as const, text: result.stdout || result.stderr || 'No output' }] };
  },
);

server.tool(
  'berth_check',
  'Scan a project directory for port conflicts before starting dev servers',
  { path: z.string().optional().describe('Project directory to check (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('berth', ['check', path || '.']);
    return { content: [{ type: 'text' as const, text: result.stdout || result.stderr || 'No output' }] };
  },
);

// --- aware ---
server.tool(
  'aware_init',
  'Auto-detect project stack and generate AI context files (CLAUDE.md, .cursorrules, etc.)',
  {
    path: z.string().optional().describe('Project directory (defaults to cwd)'),
    targets: z.string().optional().describe('Comma-separated targets: claude,cursor,copilot,agents,all'),
  },
  async ({ path, targets }) => {
    const args = ['init'];
    if (targets) args.push('--targets', targets);
    const result = await runCli('aware', args, path);
    return { content: [{ type: 'text' as const, text: result.stdout || result.stderr || 'No output' }] };
  },
);

server.tool(
  'aware_doctor',
  'Diagnose project health — check config issues, stack drift, stale AI context files',
  { path: z.string().optional().describe('Project directory (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('aware', ['doctor'], path);
    return { content: [{ type: 'text' as const, text: result.stdout || result.stderr || 'No output' }] };
  },
);

// --- vow ---
server.tool(
  'vow_scan',
  'Scan dependency licenses — summarize all licenses in the project',
  { path: z.string().optional().describe('Project directory (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('vow', ['scan'], path);
    return { content: [{ type: 'text' as const, text: result.stdout || result.stderr || 'No output' }] };
  },
);

server.tool(
  'vow_check',
  'Validate dependency licenses against policy — flag violations before release',
  { path: z.string().optional().describe('Project directory (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('vow', ['check'], path);
    return { content: [{ type: 'text' as const, text: result.stdout || result.stderr || 'No output' }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
