import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

// Velocity — embedded directly (no separate MCP server needed)
import {
  initDb,
  TaskQueries,
  registerStartTask,
  registerEndTask,
  registerEstimate,
  registerStats,
  registerHistory,
} from '@whenlabs/velocity-mcp/lib';

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
  version: '0.3.0',
});

// =====================================================================
// VELOCITY — Task timing & estimation (embedded, uses SQLite)
// =====================================================================

const velocityDb = initDb();
const velocityQueries = new TaskQueries(velocityDb);

// Cast needed: velocity-mcp may resolve its own @modelcontextprotocol/sdk copy,
// creating duplicate private types. Runtime types are identical.
const s = server as Parameters<typeof registerStartTask>[0];
registerStartTask(s, velocityQueries);
registerEndTask(s, velocityQueries);
registerEstimate(s, velocityQueries);
registerStats(s, velocityQueries);
registerHistory(s, velocityQueries);

function formatOutput(result: { stdout: string; stderr: string; code: number }): string {
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trim());
  if (result.stderr.trim()) parts.push(result.stderr.trim());
  return parts.join('\n') || 'No output';
}

// =====================================================================
// STALE — Documentation drift detection
// =====================================================================

server.tool(
  'stale_scan',
  'Scan for documentation drift — detect when docs say one thing and code says another',
  {
    path: z.string().optional().describe('Project directory to scan (defaults to cwd)'),
    deep: z.coerce.boolean().optional().describe('Enable AI-powered deep analysis'),
    git: z.coerce.boolean().optional().describe('Enable git history staleness checks'),
    format: z.enum(['terminal', 'json', 'markdown', 'sarif']).optional().describe('Output format'),
  },
  async ({ path, deep, git, format }) => {
    const args = ['scan'];
    if (deep) args.push('--deep');
    if (git) args.push('--git');
    if (format) args.push('--format', format);
    const result = await runCli('stale', args, path);
    const output = formatOutput(result);
    writeCache('stale', deriveProject(path), output, result.code);
    const extras = await checkTriggers('stale_scan', result, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
  },
);

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

// =====================================================================
// ENVALID — Environment variable validation
// =====================================================================

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

// =====================================================================
// BERTH — Port & process conflict resolution
// =====================================================================

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
  },
  async ({ oldPort, newPort, project }) => {
    const args = ['reassign', String(oldPort), String(newPort)];
    if (project) args.push('--project', project);
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

// =====================================================================
// AWARE — AI context file generation
// =====================================================================

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

// =====================================================================
// VOW — Dependency license management
// =====================================================================

server.tool(
  'vow_scan',
  'Scan dependency licenses — summarize all licenses in the project',
  {
    path: z.string().optional().describe('Project directory (defaults to cwd)'),
    production: z.coerce.boolean().optional().describe('Skip devDependencies'),
    format: z.enum(['terminal', 'json']).optional().describe('Output format'),
  },
  async ({ path, production, format }) => {
    const args = ['scan'];
    if (production) args.push('--production');
    if (format) args.push('--format', format);
    const result = await runCli('vow', args, path);
    const output = formatOutput(result);
    writeCache('vow_scan', deriveProject(path), output, result.code);
    const extras = await checkTriggers('vow_scan', result, path);
    return { content: [{ type: 'text' as const, text: output + extras.join('') }] };
  },
);

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

process.on('SIGINT', () => {
  velocityDb.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  velocityDb.close();
  process.exit(0);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
