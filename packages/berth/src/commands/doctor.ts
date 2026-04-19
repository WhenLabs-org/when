import path from 'node:path';
import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import {
  getCurrentPlatform,
  isDockerAvailable,
  shellExec,
} from '../utils/platform.js';
import { loadRegistry, getRegistryPath } from '../registry/store.js';
import { loadTeamConfig, TeamConfigError } from '../config/team.js';
import { loadConfig } from '../config/loader.js';
import { detectEnvironment } from '../utils/environment.js';
import { detectAllActive } from '../detectors/index.js';
import { historyFileStats } from '../history/recorder.js';
import { scanCheck } from './check.js';
import { formatJson } from '../reporters/json.js';

interface DoctorOptions extends GlobalOptions {
  fix?: boolean;
  dir?: string;
}

type CheckStatus = 'ok' | 'warn' | 'fail';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  fixHint?: string;
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const dir = path.resolve(options.dir || process.cwd());
  const results: CheckResult[] = [];

  results.push(await checkNodeVersion());
  results.push(await checkActivePortTool());
  results.push(await checkDocker());
  results.push(await checkRegistry());
  results.push(await checkEnvironment());
  results.push(await checkHistory());
  results.push(...(await checkProject(dir)));

  if (options.json) {
    console.log(
      formatJson({
        directory: dir,
        results,
        summary: summarize(results),
      }),
    );
  } else {
    renderResults(results);
  }

  const { errors, warnings } = summarize(results);
  if (options.fix && errors + warnings > 0) {
    await attemptFix(dir, results, options);
  }

  if (errors > 0) process.exitCode = 1;
}

function summarize(results: CheckResult[]): { ok: number; warnings: number; errors: number } {
  return {
    ok: results.filter((r) => r.status === 'ok').length,
    warnings: results.filter((r) => r.status === 'warn').length,
    errors: results.filter((r) => r.status === 'fail').length,
  };
}

function renderResults(results: CheckResult[]): void {
  console.log(chalk.bold('berth doctor\n'));
  for (const r of results) {
    const icon =
      r.status === 'ok' ? chalk.green('✓') : r.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✗');
    console.log(`  ${icon} ${chalk.bold(r.name)} — ${r.detail}`);
    if (r.status !== 'ok' && r.fixHint) {
      console.log(chalk.dim(`      ${r.fixHint}`));
    }
  }
  const { ok, warnings, errors } = summarize(results);
  const line =
    `\n${chalk.green(ok + ' ok')}` +
    (warnings > 0 ? `, ${chalk.yellow(warnings + ' warnings')}` : '') +
    (errors > 0 ? `, ${chalk.red(errors + ' errors')}` : '');
  console.log(line);
}

async function checkNodeVersion(): Promise<CheckResult> {
  const version = process.versions.node;
  const [major] = version.split('.').map((n) => parseInt(n, 10));
  if (!Number.isFinite(major) || major < 18) {
    return {
      name: 'Node.js ≥ 18',
      status: 'fail',
      detail: `running ${version}`,
      fixHint: 'Upgrade to Node 18 or later.',
    };
  }
  return { name: 'Node.js ≥ 18', status: 'ok', detail: `running ${version}` };
}

async function checkActivePortTool(): Promise<CheckResult> {
  const platform = getCurrentPlatform();
  const tool = platform === 'win32' ? 'netstat' : 'lsof';
  try {
    await shellExec(tool, platform === 'win32' ? ['-ano', '-p', 'TCP'] : ['-v'], {
      timeout: 2000,
    });
    return { name: `${tool} available`, status: 'ok', detail: 'port scanning will work' };
  } catch {
    if (platform !== 'win32') {
      // Try ss fallback on Linux.
      try {
        await shellExec('ss', ['-V'], { timeout: 2000 });
        return {
          name: 'lsof available',
          status: 'warn',
          detail: 'lsof not found; ss will be used as a fallback',
          fixHint: 'Install lsof for better accuracy: apt install lsof / brew install lsof',
        };
      } catch {
        // fall through
      }
    }
    return {
      name: `${tool} available`,
      status: 'fail',
      detail: `${tool} not found on PATH`,
      fixHint:
        platform === 'win32'
          ? 'netstat ships with Windows — check your PATH.'
          : 'Install lsof: apt install lsof / brew install lsof',
    };
  }
}

async function checkDocker(): Promise<CheckResult> {
  const available = await isDockerAvailable();
  if (!available) {
    return {
      name: 'Docker',
      status: 'warn',
      detail: 'daemon not reachable (ok if you do not use Docker)',
      fixHint: 'Start Docker Desktop / dockerd to include container ports in scans.',
    };
  }
  return { name: 'Docker', status: 'ok', detail: 'daemon reachable' };
}

async function checkRegistry(): Promise<CheckResult> {
  try {
    const reg = await loadRegistry();
    if (reg.version !== 2) {
      return {
        name: 'Registry schema',
        status: 'warn',
        detail: `registry is at version ${reg.version}, expected 2`,
        fixHint: `Run any berth command to trigger migration. Path: ${getRegistryPath()}`,
      };
    }
    return {
      name: 'Registry schema',
      status: 'ok',
      detail: `v2 at ${getRegistryPath()}`,
    };
  } catch (err) {
    return {
      name: 'Registry',
      status: 'fail',
      detail: `cannot read registry: ${(err as Error).message}`,
      fixHint: `Inspect ${getRegistryPath()}`,
    };
  }
}

async function checkEnvironment(): Promise<CheckResult> {
  const env = await detectEnvironment();
  if (env.kind === 'host') {
    return { name: 'Environment', status: 'ok', detail: 'host machine' };
  }
  const detail = env.detail ? `${env.kind} (${env.detail})` : env.kind;
  let fixHint: string | undefined;
  if (env.kind === 'wsl2') {
    fixHint = 'Windows host ports are not visible from WSL. Use `berth status --windows-host` if needed.';
  } else if (env.kind === 'docker-container') {
    fixHint = 'Running inside a container — host ports are not visible.';
  } else if (env.kind === 'ssh') {
    fixHint = 'You are connected over SSH — ports reported are the remote host\'s view.';
  }
  return { name: 'Environment', status: 'warn', detail, fixHint };
}

async function checkHistory(): Promise<CheckResult> {
  const stats = await historyFileStats();
  if (!stats) {
    return { name: 'History log', status: 'ok', detail: 'no log yet (starts on first `berth status`)' };
  }
  const mb = stats.size / (1024 * 1024);
  if (mb > 8) {
    return {
      name: 'History log',
      status: 'warn',
      detail: `${mb.toFixed(1)} MB — will rotate at 10 MB`,
      fixHint: 'The log rotates automatically on next append.',
    };
  }
  return { name: 'History log', status: 'ok', detail: `${mb.toFixed(2)} MB` };
}

async function checkProject(dir: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Team config lint
  try {
    const team = await loadTeamConfig(dir);
    if (team) {
      results.push({
        name: 'Team config',
        status: 'ok',
        detail: `${team.config.assignments.length} assignments in ${path.relative(dir, team.filePath) || team.filePath}`,
      });
    }
  } catch (err) {
    results.push({
      name: 'Team config',
      status: 'fail',
      detail: err instanceof TeamConfigError ? err.message : (err as Error).message,
      fixHint: 'Fix the schema error; `berth team lint` gives the same output.',
    });
  }

  // Project berth config
  try {
    const cfg = await loadConfig(dir);
    if (cfg) {
      results.push({
        name: 'Project config',
        status: 'ok',
        detail: `${cfg.format} at ${path.relative(dir, cfg.filePath) || cfg.filePath}`,
      });
    }
  } catch (err) {
    results.push({
      name: 'Project config',
      status: 'fail',
      detail: (err as Error).message,
      fixHint: `Fix or run \`berth init --force\` to regenerate.`,
    });
  }

  // Conflict snapshot
  try {
    const { output } = await scanCheck(dir, { quick: true });
    const errors = output.conflicts.filter((c) => c.severity === 'error').length;
    const warnings = output.conflicts.filter((c) => c.severity === 'warning').length;
    if (errors > 0 || warnings > 0) {
      results.push({
        name: 'Conflicts in cwd',
        status: errors > 0 ? 'fail' : 'warn',
        detail: `${errors} error(s), ${warnings} warning(s)`,
        fixHint: 'Run `berth resolve` to fix automatically, or `berth check` for details.',
      });
    } else if (output.scannedSources.length > 0) {
      results.push({
        name: 'Conflicts in cwd',
        status: 'ok',
        detail: `no conflicts across ${output.scannedSources.length} source(s)`,
      });
    }
  } catch {
    // scanCheck failed — skip silently (covered by other checks).
  }

  // Orphan ancestry — warn if any listening process is > 24h old
  try {
    const { ports } = await detectAllActive({ trace: true });
    const now = Date.now();
    const old = ports.filter((p) => {
      if (!p.ancestry?.startedAt) return false;
      const t = Date.parse(p.ancestry.startedAt);
      return Number.isFinite(t) && now - t > 24 * 60 * 60 * 1000;
    });
    if (old.length > 0) {
      const sample = old[0];
      results.push({
        name: 'Orphan processes',
        status: 'warn',
        detail: `${old.length} listening process(es) have been running > 24h (e.g. ${sample.process} PID ${sample.pid} on port ${sample.port})`,
        fixHint: `Inspect with: berth status --trace`,
      });
    }
  } catch {
    // ancestry unavailable — skip
  }

  return results;
}

async function attemptFix(
  dir: string,
  results: CheckResult[],
  options: DoctorOptions,
): Promise<void> {
  const conflictFailure = results.find((r) => r.name === 'Conflicts in cwd' && r.status === 'fail');
  if (!conflictFailure) {
    if (!options.json) console.log(chalk.dim('\nNothing to auto-fix safely.'));
    return;
  }
  if (!options.json) {
    console.log(chalk.bold(`\nAttempting auto-resolution via berth resolve...`));
  }
  const { resolveCommand } = await import('./resolve.js');
  await resolveCommand({
    ...options,
    dir,
    strategy: 'auto',
    kill: false,
  });
}

