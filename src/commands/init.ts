import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

function findBin(name: string): string {
  const pkgRoot = resolve(__dirname, '..');
  const localBin = resolve(pkgRoot, 'node_modules', '.bin', name);
  if (existsSync(localBin)) return localBin;
  return name;
}

function detectProject(cwd: string): { name: string; stack: string } {
  let name = basename(cwd);
  const pkgPath = resolve(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) name = pkg.name;
    } catch { /* use directory name */ }
  }

  const stackFiles: [string, string][] = [
    ['package.json', 'node'],
    ['Cargo.toml', 'rust'],
    ['go.mod', 'go'],
    ['pyproject.toml', 'python'],
    ['requirements.txt', 'python'],
    ['Gemfile', 'ruby'],
    ['build.gradle', 'java'],
    ['pom.xml', 'java'],
    ['mix.exs', 'elixir'],
    ['pubspec.yaml', 'dart'],
  ];

  const stacks: string[] = [];
  for (const [file, stack] of stackFiles) {
    if (existsSync(resolve(cwd, file)) && !stacks.includes(stack)) {
      stacks.push(stack);
    }
  }

  return { name, stack: stacks.length > 0 ? stacks.join(', ') : 'unknown' };
}

function runTool(bin: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolveP) => {
    const child = spawn(bin, args, {
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', () => resolveP({ stdout, stderr, exitCode: 127 }));
    child.on('close', (code) => resolveP({ stdout, stderr, exitCode: code ?? 1 }));
  });
}

interface ScanResult {
  label: string;
  status: 'ok' | 'issues' | 'skipped' | 'error';
  detail: string;
}

async function scanStale(cwd: string): Promise<ScanResult> {
  const { stdout, exitCode } = await runTool(findBin('stale'), ['scan', '--format', 'json', '--path', cwd]);
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
  const { stdout, exitCode } = await runTool(findBin('envalid'), ['validate', '--format', 'json']);
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
  const { stdout, exitCode } = await runTool(findBin('berth'), ['check', cwd, '--json']);
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
  const { stdout, exitCode } = await runTool(findBin('vow'), ['scan', '--format', 'json', '--path', cwd]);
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
    // Run aware init to generate context files
    const { exitCode } = await runTool(findBin('aware'), ['init']);
    if (exitCode === 0) return { label: 'AI context (aware)', status: 'ok', detail: 'Generated .aware.json and context files' };
    if (exitCode === 127) return { label: 'AI context (aware)', status: 'error', detail: 'aware not found' };
    return { label: 'AI context (aware)', status: 'skipped', detail: 'Could not generate — run `aware init` manually' };
  }
  const { stdout, stderr, exitCode } = await runTool(findBin('aware'), ['doctor']);
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
  cmd.description('Interactive onboarding — detect stack, run all checks, suggest next steps');

  cmd.action(async () => {
    const cwd = process.cwd();

    console.log('');
    console.log(colorize('  when init — project onboarding', c.bold, c.cyan));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));

    // Detect project
    const project = detectProject(cwd);
    console.log(`  Project:  ${colorize(project.name, c.bold)}`);
    console.log(`  Stack:    ${colorize(project.stack, c.cyan)}`);
    console.log(`  Path:     ${colorize(cwd, c.dim)}`);
    console.log('');
    process.stdout.write(colorize('  Scanning project…', c.dim) + '\n');

    // Run all tools in parallel
    const results = await Promise.all([
      scanStale(cwd),
      scanEnvalid(cwd),
      scanBerth(cwd),
      scanVow(cwd),
      scanAware(cwd),
    ]);

    // Clear "Scanning…" line
    process.stdout.write('\x1b[1A\x1b[2K');

    // Print results
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

    // Summary
    const issueCount = results.filter(r => r.status === 'issues').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    console.log(colorize('  ─────────────────────────────────────────', c.dim));
    if (issueCount + errorCount === 0) {
      console.log(colorize('  All clear — project looks healthy!', c.green, c.bold));
    } else {
      console.log(colorize(`  ${issueCount} tool(s) found issues, ${errorCount} could not run`, c.yellow, c.bold));
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
