import path from 'node:path';
import chalk from 'chalk';
import type { GlobalOptions, Conflict, Resolution } from '../types.js';
import { detectAllActive, detectAllConfigured } from '../detectors/index.js';
import { detectConflicts } from '../resolver/conflicts.js';
import { suggestResolutions } from '../resolver/suggestions.js';
import { killPortProcess, reassignPort } from '../resolver/actions.js';
import { findFreePort } from '../utils/ports.js';
import { formatJson } from '../reporters/json.js';

export type Strategy = 'kill' | 'reassign' | 'auto';

export interface ResolveOptions extends GlobalOptions {
  dryRun?: boolean;
  kill?: boolean;
  strategy: Strategy;
  dir: string;
}

interface ResolveAction {
  port: number;
  type: 'kill' | 'reassign' | 'skip';
  description: string;
  success: boolean;
  targetPort?: number;
  pid?: number;
  filesModified?: string[];
}

export interface ResolveOutput {
  project: string;
  directory: string;
  conflictsFound: number;
  actions: ResolveAction[];
  dryRun: boolean;
}

/**
 * Pick the best resolution for a conflict based on the chosen strategy.
 *
 * - "kill": prefer killing blocking processes (requires --kill flag)
 * - "reassign": prefer changing ports in config files
 * - "auto": kill dev processes when possible, reassign config-only conflicts
 */
function pickResolution(
  _conflict: Conflict,
  resolutions: Resolution[],
  strategy: Strategy,
  killAllowed: boolean,
): Resolution | null {
  const killResolutions = resolutions.filter((r) => r.type === 'kill' && r.automatic);
  const reassignResolutions = resolutions.filter((r) => r.type === 'reassign' && r.automatic);

  if (strategy === 'kill') {
    if (killResolutions.length > 0 && killAllowed) return killResolutions[0];
    // Fall back to reassign if nothing to kill
    if (reassignResolutions.length > 0) return reassignResolutions[0];
    return null;
  }

  if (strategy === 'reassign') {
    if (reassignResolutions.length > 0) return reassignResolutions[0];
    return null;
  }

  // strategy === 'auto'
  // If there's an active dev process blocking, prefer kill (if allowed)
  if (killResolutions.length > 0 && killAllowed) {
    return killResolutions[0];
  }
  // Otherwise reassign
  if (reassignResolutions.length > 0) return reassignResolutions[0];
  return null;
}

export async function resolveCommand(options: ResolveOptions): Promise<void> {
  const absDir = path.resolve(options.dir);
  const projectName = path.basename(absDir);

  const [{ ports: active, docker }, { ports: configured }] = await Promise.all([
    detectAllActive(),
    detectAllConfigured(absDir),
  ]);

  const conflicts = detectConflicts(active, docker, configured);

  if (conflicts.length === 0) {
    if (options.json) {
      console.log(formatJson({
        project: projectName,
        directory: absDir,
        conflictsFound: 0,
        actions: [],
        dryRun: options.dryRun ?? false,
      } satisfies ResolveOutput));
    } else {
      console.log(chalk.green('No conflicts detected. All ports are free.'));
    }
    return;
  }

  if (!options.json) {
    console.log(chalk.bold(`\nResolving ${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} in ${projectName}/...\n`));
  }

  const actions: ResolveAction[] = [];
  // Track ports we've already decided to reassign to, so we don't double-assign
  const usedPorts: number[] = [];

  for (const conflict of conflicts) {
    const resolutions = await suggestResolutions(conflict);
    const chosen = pickResolution(conflict, resolutions, options.strategy, options.kill ?? false);

    if (!chosen) {
      if (!options.json) {
        console.log(chalk.yellow(`  [skip] Port ${conflict.port} -- cannot auto-resolve: ${conflict.suggestion}`));
        if (!options.kill && resolutions.some((r) => r.type === 'kill')) {
          console.log(chalk.dim(`         Pass --kill to allow killing blocking processes.`));
        }
      }
      actions.push({
        port: conflict.port,
        type: 'skip',
        description: `Cannot auto-resolve: ${conflict.suggestion}`,
        success: false,
      });
      continue;
    }

    if (chosen.type === 'kill' && chosen.pid) {
      if (options.dryRun) {
        if (!options.json) {
          console.log(chalk.dim(`  [dry-run] Would kill PID ${chosen.pid} on port ${conflict.port}`));
        }
        actions.push({
          port: conflict.port,
          type: 'kill',
          description: chosen.description,
          success: true,
          pid: chosen.pid,
        });
      } else {
        const result = await killPortProcess(conflict.port);
        const success = result.killed.length > 0;
        if (!options.json) {
          if (success) {
            console.log(chalk.green(`  [kill] Killed process on port ${conflict.port} (PID ${chosen.pid})`));
          } else {
            console.log(chalk.red(`  [fail] Could not kill process on port ${conflict.port}`));
          }
        }
        actions.push({
          port: conflict.port,
          type: 'kill',
          description: chosen.description,
          success,
          pid: chosen.pid,
        });
      }
    } else if (chosen.type === 'reassign' && chosen.targetPort) {
      // Find a free port that hasn't been claimed by a previous reassignment
      let targetPort = chosen.targetPort;
      if (usedPorts.includes(targetPort)) {
        try {
          targetPort = await findFreePort(conflict.port + 1, [conflict.port, ...usedPorts]);
        } catch {
          if (!options.json) {
            console.log(chalk.red(`  [fail] Could not find a free port near ${conflict.port}`));
          }
          actions.push({
            port: conflict.port,
            type: 'reassign',
            description: `No free port available near ${conflict.port}`,
            success: false,
          });
          continue;
        }
      }
      usedPorts.push(targetPort);

      if (options.dryRun) {
        if (!options.json) {
          console.log(chalk.dim(`  [dry-run] Would reassign port ${conflict.port} -> ${targetPort} in config files`));
        }
        actions.push({
          port: conflict.port,
          type: 'reassign',
          description: `Reassign port ${conflict.port} -> ${targetPort}`,
          success: true,
          targetPort,
        });
      } else {
        const result = await reassignPort(absDir, conflict.port, targetPort);
        const success = result.filesModified.length > 0;
        if (!options.json) {
          if (success) {
            console.log(chalk.green(`  [reassign] Port ${conflict.port} -> ${targetPort}`));
            for (const f of result.filesModified) {
              console.log(chalk.dim(`    modified: ${path.relative(absDir, f)}`));
            }
          } else {
            console.log(chalk.yellow(`  [skip] No config files found to update for port ${conflict.port}`));
          }
        }
        actions.push({
          port: conflict.port,
          type: 'reassign',
          description: `Reassign port ${conflict.port} -> ${targetPort}`,
          success,
          targetPort,
          filesModified: result.filesModified,
        });
      }
    }
  }

  const output: ResolveOutput = {
    project: projectName,
    directory: absDir,
    conflictsFound: conflicts.length,
    actions,
    dryRun: options.dryRun ?? false,
  };

  if (options.json) {
    console.log(formatJson(output));
  } else {
    const resolved = actions.filter((a) => a.success).length;
    const skipped = actions.filter((a) => !a.success).length;
    console.log('');
    if (skipped === 0) {
      console.log(chalk.green(`All ${resolved} conflict${resolved !== 1 ? 's' : ''} resolved.`));
    } else {
      console.log(
        `${chalk.green(`${resolved} resolved`)}, ${chalk.yellow(`${skipped} skipped`)}. ` +
        `Run with ${chalk.bold('--kill')} or fix manually.`,
      );
    }
  }

  if (actions.some((a) => !a.success)) {
    process.exitCode = 1;
  }
}
