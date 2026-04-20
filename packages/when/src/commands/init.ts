import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { buildSpawn } from '../utils/find-bin.js';
import { detectProjectWithStack } from '../utils/detect-project.js';
import { loadConfig, CONFIG_FILENAME } from '../config/whenlabs-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function colorize(text: string, ...codes: string[]): string {
  return codes.join('') + text + c.reset;
}

function detectLicenseTemplate(cwd: string): string {
  const pkgPath = resolve(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const license: string = (pkg.license ?? '').toLowerCase();
      if (['mit', 'isc', 'apache-2.0', 'apache2', 'bsd-2-clause', 'bsd-3-clause'].some(l => license.includes(l))) {
        return 'opensource';
      }
      if (license) return 'commercial';
    } catch { /* fall through */ }
  }
  return 'opensource';
}

function runTool(name: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolveP) => {
    const s = buildSpawn(name);
    const child = spawn(s.cmd, [...s.args, ...args], {
      cwd: cwd,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      shell: s.shell,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', () => resolveP({ stdout, stderr, exitCode: 127 }));
    child.on('close', (code) => resolveP({ stdout, stderr, exitCode: code ?? 1 }));
  });
}

interface BootstrapResult {
  label: string;
  action: 'created' | 'skipped' | 'error';
  detail: string;
}

async function bootstrapConfigs(cwd: string): Promise<{ results: BootstrapResult[]; staleScanNeeded: boolean }> {
  const results: BootstrapResult[] = [];

  // envalid: if .env exists but .env.schema doesn't, generate schema
  const hasEnv = existsSync(resolve(cwd, '.env'));
  const hasEnvSchema = existsSync(resolve(cwd, '.env.schema'));
  if (hasEnv && !hasEnvSchema) {
    const { exitCode } = await runTool('envalid', ['init'], cwd);
    if (exitCode === 0) {
      results.push({ label: '.env.schema', action: 'created', detail: 'Created .env.schema from .env' });
    } else if (exitCode === 127) {
      results.push({ label: '.env.schema', action: 'error', detail: 'envalid not found' });
    } else {
      results.push({ label: '.env.schema', action: 'error', detail: 'envalid init failed' });
    }
  } else if (hasEnvSchema) {
    results.push({ label: '.env.schema', action: 'skipped', detail: 'Skipped (already exists)' });
  } else {
    results.push({ label: '.env.schema', action: 'skipped', detail: 'Skipped (no .env found)' });
  }

  // vow: if neither .vow.yml nor .vow.json exists, run vow init (emits .vow.yml)
  const hasVowConfig = existsSync(resolve(cwd, '.vow.yml')) || existsSync(resolve(cwd, '.vow.json'));
  if (!hasVowConfig) {
    const template = detectLicenseTemplate(cwd);
    const { exitCode } = await runTool('vow', ['init', '--template', template], cwd);
    if (exitCode === 0) {
      results.push({ label: '.vow.yml', action: 'created', detail: `Created .vow.yml (template: ${template})` });
    } else if (exitCode === 127) {
      results.push({ label: '.vow.yml', action: 'error', detail: 'vow not found' });
    } else {
      results.push({ label: '.vow.yml', action: 'error', detail: 'vow init failed' });
    }
  } else {
    results.push({ label: '.vow.yml', action: 'skipped', detail: 'Skipped (already exists)' });
  }

  // stale: if .stale.yml doesn't exist, run stale init
  const hasStaleConfig = existsSync(resolve(cwd, '.stale.yml'));
  let staleScanNeeded = false;
  if (!hasStaleConfig) {
    const { exitCode } = await runTool('stale', ['init'], cwd);
    if (exitCode === 0) {
      results.push({ label: '.stale.yml', action: 'created', detail: 'Created .stale.yml' });
      staleScanNeeded = true;
    } else if (exitCode === 127) {
      results.push({ label: '.stale.yml', action: 'error', detail: 'stale not found' });
    } else {
      results.push({ label: '.stale.yml', action: 'error', detail: 'stale init failed' });
    }
  } else {
    results.push({ label: '.stale.yml', action: 'skipped', detail: 'Skipped (already exists)' });
  }

  // berth: always register project ports
  const { exitCode: berthCode } = await runTool('berth', ['register', '--yes', '--dir', cwd], cwd);
  if (berthCode === 0) {
    results.push({ label: 'berth ports', action: 'created', detail: 'Registered project ports' });
  } else if (berthCode === 127) {
    results.push({ label: 'berth ports', action: 'error', detail: 'berth not found' });
  } else {
    results.push({ label: 'berth ports', action: 'error', detail: 'berth register failed' });
  }

  return { results, staleScanNeeded };
}

function bootstrapIcon(action: BootstrapResult['action']): string {
  switch (action) {
    case 'created': return colorize('+', c.green);
    case 'skipped': return colorize('-', c.dim);
    case 'error': return colorize('!', c.yellow);
  }
}

interface ScanResult {
  label: string;
  status: 'ok' | 'issues' | 'skipped' | 'error';
  detail: string;
}

async function scanStale(cwd: string): Promise<ScanResult> {
  const { stdout, exitCode } = await runTool('stale', ['scan', '--format', 'json', '--path', cwd]);
  if (exitCode === 127) return { label: 'Doc drift (stale)', status: 'error', detail: 'stale not found' };
  try {
    const json = JSON.parse(stdout);
    const total = (json.summary?.errors ?? 0) + (json.summary?.warnings ?? 0);
    return { label: 'Doc drift (stale)', status: total > 0 ? 'issues' : 'ok', detail: total === 0 ? 'No drift detected' : `${total} issue(s)` };
  } catch {
    return { label: 'Doc drift (stale)', status: 'error', detail: 'Could not parse output' };
  }
}

async function scanEnvalid(cwd: string): Promise<ScanResult> {
  const { stdout, exitCode } = await runTool('envalid', ['validate', '--format', 'json']);
  if (exitCode === 127) return { label: 'Env validation (envalid)', status: 'error', detail: 'envalid not found' };
  if (exitCode === 2 || stdout.includes('not found')) return { label: 'Env validation (envalid)', status: 'skipped', detail: 'No .env.schema — run `envalid init`' };
  try {
    const json = JSON.parse(stdout);
    const total = (json.summary?.errors ?? 0) + (json.summary?.warnings ?? 0);
    return { label: 'Env validation (envalid)', status: total > 0 ? 'issues' : 'ok', detail: total === 0 ? '.env is valid' : `${total} issue(s)` };
  } catch {
    return { label: 'Env validation (envalid)', status: 'error', detail: 'Could not parse output' };
  }
}

async function scanBerth(cwd: string): Promise<ScanResult> {
  const { stdout, exitCode } = await runTool('berth', ['check', cwd, '--json']);
  if (exitCode === 127) return { label: 'Port conflicts (berth)', status: 'error', detail: 'berth not found' };
  try {
    const json = JSON.parse(stdout);
    const conflicts = json.conflicts?.length ?? 0;
    return { label: 'Port conflicts (berth)', status: conflicts > 0 ? 'issues' : 'ok', detail: conflicts === 0 ? 'No conflicts' : `${conflicts} conflict(s)` };
  } catch {
    return { label: 'Port conflicts (berth)', status: 'error', detail: 'Could not parse output' };
  }
}

async function scanVow(cwd: string): Promise<ScanResult> {
  const { stdout, exitCode } = await runTool('vow', ['scan', '--format', 'json', '--path', cwd]);
  if (exitCode === 127) return { label: 'License scan (vow)', status: 'error', detail: 'vow not found' };
  const jsonStart = stdout.indexOf('{');
  const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
  try {
    const json = JSON.parse(jsonStr);
    const total = json.packages?.length ?? 0;
    const flagged = json.packages?.filter((p: { license?: { category?: string } }) =>
      !p.license?.category || p.license.category === 'unknown' || p.license.category === 'copyleft'
    ).length ?? 0;
    return { label: 'License scan (vow)', status: flagged > 0 ? 'issues' : 'ok', detail: total === 0 ? 'No packages' : flagged === 0 ? `${total} packages, all permissive` : `${flagged}/${total} flagged` };
  } catch {
    return { label: 'License scan (vow)', status: 'error', detail: 'Could not parse output' };
  }
}

async function scanAware(cwd: string): Promise<ScanResult> {
  const hasConfig = existsSync(resolve(cwd, '.aware.json'));
  if (!hasConfig) {
    const { exitCode } = await runTool('aware', ['init', '--force'], cwd);
    if (exitCode === 0) return { label: 'AI context (aware)', status: 'ok', detail: 'Generated .aware.json and context files' };
    if (exitCode === 127) return { label: 'AI context (aware)', status: 'error', detail: 'aware not found' };
    return { label: 'AI context (aware)', status: 'skipped', detail: 'Could not generate — run `aware init` manually' };
  }
  const { stdout, stderr, exitCode } = await runTool('aware', ['doctor'], cwd);
  if (exitCode === 127) return { label: 'AI context (aware)', status: 'error', detail: 'aware not found' };
  const combined = (stdout + stderr).trim();
  const warnings = combined.split('\n').filter(l => l.includes('⚠') || /warn/i.test(l)).length;
  return { label: 'AI context (aware)', status: warnings > 0 ? 'issues' : 'ok', detail: warnings > 0 ? `${warnings} warning(s)` : 'Context files up to date' };
}

function statusIcon(status: ScanResult['status']): string {
  switch (status) {
    case 'ok': return colorize('✓', c.green);
    case 'issues': return colorize('✗', c.red);
    case 'error': return colorize('!', c.yellow);
    case 'skipped': return colorize('-', c.dim);
  }
}

export function createInitCommand(): Command {
  const cmd = new Command('init');
  cmd.description('Interactive onboarding — detect stack, bootstrap tool configs, run all checks');

  cmd.action(async () => {
    const cwd = process.cwd();

    console.log('');
    console.log(colorize('  when init — project onboarding', c.bold, c.cyan));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));

    // Detect project
    const project = detectProjectWithStack(cwd);
    console.log(`  Project:  ${colorize(project.name, c.bold)}`);
    console.log(`  Stack:    ${colorize(project.stack, c.cyan)}`);
    console.log(`  Path:     ${colorize(cwd, c.dim)}`);
    console.log('');

    // Bootstrap tool configs sequentially
    process.stdout.write(colorize('  Bootstrapping tool configs…', c.dim) + '\n');
    const { results: bootstrapResults, staleScanNeeded } = await bootstrapConfigs(cwd);
    process.stdout.write('\x1b[1A\x1b[2K');

    console.log(colorize('  Bootstrap', c.bold));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));
    for (const r of bootstrapResults) {
      const icon = bootstrapIcon(r.action);
      const label = r.label.padEnd(20);
      const detail = r.action === 'created' ? colorize(r.detail, c.green)
        : r.action === 'error' ? colorize(r.detail, c.yellow)
        : colorize(r.detail, c.dim);
      console.log(`  ${icon}  ${label} ${detail}`);
    }

    // Generate .whenlabs.yml if it doesn't exist yet
    const whenlabsConfigPath = resolve(cwd, CONFIG_FILENAME);
    if (!existsSync(whenlabsConfigPath)) {
      try {
        // Read back created configs to merge into unified file
        const mergedConfig: Record<string, unknown> = {};

        const staleConfigPath = resolve(cwd, '.stale.yml');
        if (existsSync(staleConfigPath)) {
          mergedConfig['stale'] = {};
        }

        const vowConfigPath = resolve(cwd, '.vow.json');
        if (existsSync(vowConfigPath)) {
          try {
            const vowData = JSON.parse(readFileSync(vowConfigPath, 'utf-8'));
            mergedConfig['vow'] = {
              ...(typeof vowData.policy === 'string' ? { policy: vowData.policy } : {}),
              ...(typeof vowData.production_only === 'boolean' ? { production_only: vowData.production_only } : {}),
            };
          } catch { mergedConfig['vow'] = {}; }
        }

        const envSchemaPath = resolve(cwd, '.env.schema');
        if (existsSync(envSchemaPath)) {
          mergedConfig['envalid'] = { schema: '.env.schema' };
        }

        mergedConfig['berth'] = {};
        mergedConfig['aware'] = {};
        mergedConfig['velocity'] = {};

        writeFileSync(whenlabsConfigPath, stringify(mergedConfig, { lineWidth: 0 }), 'utf-8');
        console.log(`  ${colorize('+', c.green)}  ${colorize(CONFIG_FILENAME, c.bold)} ${colorize('created', c.green)}`);
      } catch {
        console.log(`  ${colorize('!', c.yellow)}  Could not generate ${colorize(CONFIG_FILENAME, c.bold)}`);
      }
    } else {
      console.log(`  ${colorize('-', c.dim)}  ${colorize(CONFIG_FILENAME, c.bold)} ${colorize('already exists', c.dim)}`);
    }
    console.log('');

    // Run all 5 scans in parallel
    process.stdout.write(colorize('  Scanning project…', c.dim) + '\n');
    const results = await Promise.all([
      scanStale(cwd),
      scanEnvalid(cwd),
      scanBerth(cwd),
      scanVow(cwd),
      scanAware(cwd),
    ]);
    process.stdout.write('\x1b[1A\x1b[2K');

    // Print scan results
    console.log(colorize('  Scan Results', c.bold));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));
    for (const r of results) {
      const icon = statusIcon(r.status);
      const label = r.label.padEnd(28);
      const detail = r.status === 'ok' ? colorize(r.detail, c.green)
        : r.status === 'skipped' ? colorize(r.detail, c.dim)
        : r.status === 'error' ? colorize(r.detail, c.yellow)
        : colorize(r.detail, c.red);
      console.log(`  ${icon}  ${label} ${detail}`);
    }

    // Auto-fix: if stale scan found issues, run stale fix --apply
    const staleResult = results.find(r => r.label === 'Doc drift (stale)');
    if (staleResult?.status === 'issues' || staleScanNeeded) {
      process.stdout.write(colorize('  Auto-fixing doc drift…', c.dim) + '\n');
      const { exitCode: fixCode } = await runTool('stale', ['fix', '--apply'], cwd);
      process.stdout.write('\x1b[1A\x1b[2K');
      if (fixCode === 0) {
        console.log(`  ${colorize('✓', c.green)}  ${colorize('Doc drift auto-fixed', c.green)}`);
      } else if (fixCode === 127) {
        console.log(`  ${colorize('!', c.yellow)}  ${colorize('stale not found for auto-fix', c.yellow)}`);
      } else {
        console.log(`  ${colorize('-', c.dim)}  ${colorize('No high-confidence fixes available', c.dim)}`);
      }
    }

    // Summary
    const issueCount = results.filter(r => r.status === 'issues').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const bootstrapErrors = bootstrapResults.filter(r => r.action === 'error').length;
    const bootstrapCreated = bootstrapResults.filter(r => r.action === 'created').length;
    console.log(colorize('  ─────────────────────────────────────────', c.dim));
    if (issueCount + errorCount + bootstrapErrors === 0) {
      console.log(colorize('  All clear — project looks healthy!', c.green, c.bold));
    } else {
      const parts: string[] = [];
      if (bootstrapCreated > 0) parts.push(`${bootstrapCreated} config(s) created`);
      if (issueCount > 0) parts.push(`${issueCount} scan(s) found issues`);
      if (errorCount + bootstrapErrors > 0) parts.push(`${errorCount + bootstrapErrors} tool(s) could not run`);
      console.log(colorize(`  ${parts.join(', ')}`, c.yellow, c.bold));
    }

    // Next steps
    console.log('');
    console.log(colorize('  Next steps:', c.bold));
    const mcpInstalled = existsSync(resolve(process.env.HOME ?? '~', '.claude', 'settings.json'));
    if (!mcpInstalled) {
      console.log(`    ${colorize('•', c.cyan)} Run ${colorize('when install', c.bold)} to connect MCP tools to Claude Code`);
    }
    console.log(`    ${colorize('•', c.cyan)} Run ${colorize('when doctor', c.bold)} for a full health report`);
    if (results.some(r => r.status === 'issues')) {
      console.log(`    ${colorize('•', c.cyan)} Fix reported issues and re-run ${colorize('when init', c.bold)}`);
    }
    console.log('');
  });

  return cmd;
}
