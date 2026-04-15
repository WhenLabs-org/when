import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findBin(name: string): string {
  const pkgRoot = resolve(__dirname, '..');

  // 1. Check node_modules/.bin symlink (normal case)
  const localBin = resolve(pkgRoot, 'node_modules', '.bin', name);
  if (existsSync(localBin)) return localBin;

  // 2. Check @whenlabs/<name>/dist/cli.js directly (handles missing/wrong symlinks)
  const directCli = resolve(pkgRoot, 'node_modules', '@whenlabs', name, 'dist', 'cli.js');
  if (existsSync(directCli)) return directCli;

  // 3. Fallback to global PATH
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

const CACHE_DIR = join(homedir(), '.whenlabs', 'cache');

function writeCache(tool: string, project: string, output: string, code: number): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const file = join(CACHE_DIR, `${tool}_${project}.json`);
    writeFileSync(file, JSON.stringify({ timestamp: Date.now(), output, code }));
  } catch {
    // best-effort
  }
}

function deriveProject(path?: string): string {
  const dir = path || process.cwd();
  return dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'unknown';
}

function readAwareProjectName(path?: string): string | null {
  try {
    const awareFile = join(path || process.cwd(), '.aware.json');
    if (!existsSync(awareFile)) return null;
    const data = JSON.parse(readFileSync(awareFile, 'utf8'));
    return data.name || data.project || null;
  } catch {
    return null;
  }
}

async function checkTriggers(toolName: string, result: { stdout: string; stderr: string; code: number }, path?: string): Promise<string[]> {
  const output = result.stdout || result.stderr || '';
  const extras: string[] = [];

  if (toolName === 'aware_init') {
    // Only trigger if aware_init made actual changes (look for "wrote" / "created" / "updated" in output)
    const madeChanges = /wrote|created|updated|generated/i.test(output);
    if (madeChanges) {
      const staleResult = await runCli('stale', ['scan'], path);
      const staleOutput = staleResult.stdout || staleResult.stderr || '';
      writeCache('stale', deriveProject(path), staleOutput, staleResult.code);
      if (staleOutput.trim()) {
        extras.push(`\n--- Auto-triggered stale_scan (stack change detected) ---\n${staleOutput}`);
      }
    }
  }

  if (toolName === 'vow_scan') {
    // Trigger note if unknown licenses found
    const hasUnknown = /unknown|UNKNOWN|unlicensed/i.test(output);
    if (hasUnknown) {
      extras.push('\nNote: Unknown licenses detected — check README for license accuracy claims.');
    }
  }

  if (toolName === 'berth_check') {
    // If conflicts found, try to include project name from .aware.json
    const hasConflicts = /conflict|in use|occupied|taken/i.test(output);
    if (hasConflicts) {
      const projectName = readAwareProjectName(path);
      if (projectName) {
        extras.push(`\nNote: Conflicts found in project "${projectName}".`);
      }
    }
  }

  return extras;
}

const server = new McpServer({
  name: 'whenlabs',
  version: '0.1.0',
});

function formatOutput(result: { stdout: string; stderr: string; code: number }): string {
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trim());
  if (result.stderr.trim()) parts.push(result.stderr.trim());
  return parts.join('\n') || 'No output';
}

// --- stale ---
server.tool(
  'stale_scan',
  'Scan for documentation drift — detect when docs say one thing and code says another',
  { path: z.string().optional().describe('Project directory to scan (defaults to cwd)') },
  async ({ path }) => {
    const args = ['scan'];
    const result = await runCli('stale', args, path);
    const output = formatOutput(result);
    writeCache('stale', deriveProject(path), output, result.code);
    const extras = await checkTriggers('stale_scan', result, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
  },
);

// --- envalid ---
server.tool(
  'envalid_validate',
  'Validate .env files against their schema — catch missing or invalid environment variables',
  { path: z.string().optional().describe('Project directory (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('envalid', ['validate'], path);
    const output = formatOutput(result);
    writeCache('envalid_validate', deriveProject(path), output, result.code);
    const extras = await checkTriggers('envalid_validate', result, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
  },
);

server.tool(
  'envalid_detect',
  'Scan codebase for env var usage and compare with schema — find undocumented env vars',
  { path: z.string().optional().describe('Project directory (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('envalid', ['detect'], path);
    const output = formatOutput(result);
    writeCache('envalid_detect', deriveProject(path), output, result.code);
    const extras = await checkTriggers('envalid_detect', result, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
  },
);

// --- berth ---
server.tool(
  'berth_status',
  'Show all active ports, Docker ports, and configured ports — diagnose port conflicts',
  {},
  async () => {
    const result = await runCli('berth', ['status', '--json']);
    const output = formatOutput(result);
    writeCache('berth_status', deriveProject(), output, result.code);
    const extras = await checkTriggers('berth_status', result);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
  },
);

server.tool(
  'berth_check',
  'Scan a project directory for port conflicts before starting dev servers',
  { path: z.string().optional().describe('Project directory to check (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('berth', ['check', path || '.']);
    const output = formatOutput(result);
    writeCache('berth_check', deriveProject(path), output, result.code);
    const extras = await checkTriggers('berth_check', result, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
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
    const output = formatOutput(result);
    writeCache('aware_init', deriveProject(path), output, result.code);
    const extras = await checkTriggers('aware_init', result, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
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

// --- vow ---
server.tool(
  'vow_scan',
  'Scan dependency licenses — summarize all licenses in the project',
  { path: z.string().optional().describe('Project directory (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('vow', ['scan'], path);
    const output = formatOutput(result);
    writeCache('vow_scan', deriveProject(path), output, result.code);
    const extras = await checkTriggers('vow_scan', result, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
  },
);

server.tool(
  'vow_check',
  'Validate dependency licenses against policy — flag violations before release',
  { path: z.string().optional().describe('Project directory (defaults to cwd)') },
  async ({ path }) => {
    const result = await runCli('vow', ['check'], path);
    const output = formatOutput(result);
    writeCache('vow_check', deriveProject(path), output, result.code);
    const extras = await checkTriggers('vow_check', result, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
