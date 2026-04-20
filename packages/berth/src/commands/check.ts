import path from 'node:path';
import chalk from 'chalk';
import type { GlobalOptions, CheckOutput, ActivePort, DockerPort } from '../types.js';
import { detectAllActive, detectAllConfigured } from '../detectors/index.js';
import type { ActiveDetectionResult } from '../detectors/index.js';
import { detectAllConflicts } from '../resolver/conflicts.js';
import { suggestResolutions } from '../resolver/suggestions.js';
import { renderCheck } from '../reporters/terminal.js';
import { formatJson } from '../reporters/json.js';
import { wrapCheck } from '../reporters/mcp.js';
import { buildScanContext } from './_context.js';
import { cached } from '../utils/cache.js';

interface CheckOptions extends GlobalOptions {
  fix?: boolean;
  mcp?: boolean;
  quick?: boolean;
  silent?: boolean;
}

const QUICK_CACHE_TTL_MS = 2_000;
const QUICK_CACHE_KEY = 'active-ports';

export interface ScanCheckOptions {
  /** Use a short-lived cache for the active-port scan. */
  quick?: boolean;
}

export interface ScanCheckResult {
  output: CheckOutput;
  active: ActivePort[];
  docker: DockerPort[];
  warnings: string[];
}

export async function scanCheck(
  dir: string,
  scanOptions: ScanCheckOptions = {},
): Promise<ScanCheckResult> {
  const absDir = path.resolve(dir);
  const ctx = await buildScanContext(absDir);
  const projectName = ctx.config?.projectName ?? path.basename(absDir);

  const activeScan = scanOptions.quick
    ? cached<ActiveDetectionResult>(QUICK_CACHE_KEY, QUICK_CACHE_TTL_MS, () =>
        detectAllActive({ registry: ctx.detectorRegistry, config: ctx.config }),
      )
    : detectAllActive({ registry: ctx.detectorRegistry, config: ctx.config });

  const [{ ports: active, docker, warnings: activeWarnings }, { ports: configured, warnings: configuredWarnings }] =
    await Promise.all([
      activeScan,
      detectAllConfigured(absDir, { registry: ctx.detectorRegistry, config: ctx.config }),
    ]);

  const warnings = [...ctx.warnings, ...activeWarnings, ...configuredWarnings];
  const conflicts = detectAllConflicts({ active, docker, configured });

  const allResolutions = [];
  for (const conflict of conflicts) {
    const resolutions = await suggestResolutions(conflict);
    allResolutions.push(...resolutions);
  }

  const sourceMap = new Map<string, { file: string; type: string; count: number }>();
  for (const p of configured) {
    const key = p.sourceFile;
    const existing = sourceMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      sourceMap.set(key, { file: path.relative(absDir, p.sourceFile), type: p.source, count: 1 });
    }
  }

  const output: CheckOutput = {
    project: projectName,
    directory: absDir,
    scannedSources: Array.from(sourceMap.values()).map((s) => ({
      file: s.file,
      type: s.type as any,
      portsFound: s.count,
    })),
    conflicts,
    resolutions: allResolutions,
  };

  return { output, active, docker, warnings };
}

export async function checkCommand(dir: string, options: CheckOptions): Promise<void> {
  const { output, warnings, active, docker } = await scanCheck(dir, { quick: options.quick });
  const conflicts = output.conflicts;

  // Quick+silent: only print if there's an error-severity conflict. Used by
  // shell hooks where latency matters and noise is unwelcome.
  if (options.quick && options.silent) {
    const errorConflicts = conflicts.filter((c) => c.severity === 'error');
    if (errorConflicts.length > 0) {
      const ports = errorConflicts.map((c) => c.port).join(', ');
      console.error(
        chalk.yellow(
          `berth: port${errorConflicts.length === 1 ? '' : 's'} ${ports} already held ` +
            `(run "berth status" for details)`,
        ),
      );
      process.exitCode = 1;
    }
    // Avoid the normal rendering path.
    void active;
    void docker;
    return;
  }

  if (options.mcp) {
    console.log(formatJson(wrapCheck(output)));
  } else if (options.json) {
    console.log(formatJson(output));
  } else {
    console.log(renderCheck(output));
    if (options.verbose) {
      for (const w of warnings) {
        console.error(`Warning: ${w}`);
      }
    }
  }

  if (conflicts.length > 0) {
    if (options.fix) {
      const { resolveCommand } = await import('./resolve.js');
      console.log('');
      await resolveCommand({
        ...options,
        dir: output.directory,
        strategy: 'auto',
        kill: false,
      });
    } else if (!options.json) {
      console.log(chalk.dim(`\nRun ${chalk.white('berth resolve')} to auto-fix conflicts.`));
    }
    process.exitCode = 1;
  }
}
