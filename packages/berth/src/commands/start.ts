import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { loadRegistry } from '../registry/store.js';
import { getProjectByName } from '../registry/project.js';
import { activeReservations } from '../registry/reservations.js';
import { detectAllActive, detectAllConfigured } from '../detectors/index.js';
import { detectAllConflicts } from '../resolver/conflicts.js';
import { suggestResolutions } from '../resolver/suggestions.js';
import { killPortProcess, reassignPort } from '../resolver/actions.js';
import { buildScanContext } from './_context.js';

import { formatJson } from '../reporters/json.js';

interface StartOptions extends GlobalOptions {
  dryRun?: boolean;
}

export async function startCommand(projectName: string, options: StartOptions): Promise<void> {
  const registry = await loadRegistry();
  const project = getProjectByName(projectName, registry);

  if (!project) {
    console.error(chalk.red(`Project "${projectName}" not found in registry.`));
    console.error('Run `berth register` in the project directory first.');
    process.exitCode = 2;
    return;
  }

  const ctx = await buildScanContext(project.directory, { skipRegistry: true });
  const [{ ports: active, docker }, { ports: configured }] = await Promise.all([
    detectAllActive({ registry: ctx.detectorRegistry, config: ctx.config }),
    detectAllConfigured(project.directory, { registry: ctx.detectorRegistry, config: ctx.config }),
  ]);

  const reservations = activeReservations(registry);
  for (const tr of ctx.reservations) {
    if (tr.source === 'team' && !reservations.some((r) => r.port === tr.port)) {
      reservations.push(tr);
    }
  }
  const conflicts = detectAllConflicts({
    active,
    docker,
    configured,
    reservations,
    team: ctx.team,
  });

  if (conflicts.length === 0) {
    if (options.json) {
      console.log(formatJson({ project: projectName, conflicts: 0, actions: [], message: 'All ports free' }));
    } else {
      console.log(chalk.green(`All ports free for ${projectName}. Ready to go!`));
    }
    return;
  }

  if (!options.json) {
    console.log(chalk.bold(`Resolving conflicts for ${projectName}...`));
  }

  const actions: Array<{ description: string; success: boolean }> = [];

  for (const conflict of conflicts) {
    const resolutions = await suggestResolutions(conflict);
    const autoResolution = resolutions.find((r) => r.automatic);

    if (!autoResolution) {
      if (!options.json) {
        console.log(chalk.yellow(`  ⚠ Port ${conflict.port} — cannot auto-resolve: ${conflict.suggestion}`));
      }
      actions.push({ description: `Port ${conflict.port}: manual resolution needed`, success: false });
      continue;
    }

    if (options.dryRun) {
      if (!options.json) {
        console.log(chalk.dim(`  [dry-run] Would: ${autoResolution.description}`));
      }
      actions.push({ description: autoResolution.description, success: true });
      continue;
    }

    // Execute resolution
    if (autoResolution.type === 'kill' && autoResolution.pid) {
      const result = await killPortProcess(conflict.port);
      const success = result.killed.length > 0;
      if (!options.json) {
        if (success) {
          console.log(chalk.green(`  → Killed process on port ${conflict.port}`));
        } else {
          console.log(chalk.red(`  ✗ Failed to kill process on port ${conflict.port}`));
        }
      }
      actions.push({ description: autoResolution.description, success });
    } else if (autoResolution.type === 'reassign' && autoResolution.targetPort) {
      const result = await reassignPort(project.directory, conflict.port, autoResolution.targetPort);
      const success = result.filesModified.length > 0;
      if (!options.json) {
        if (success) {
          console.log(chalk.green(`  → Remapped port ${conflict.port} → ${autoResolution.targetPort}`));
        } else {
          console.log(chalk.yellow(`  ⚠ No files to update for port ${conflict.port}`));
        }
      }
      actions.push({ description: autoResolution.description, success });
    }
  }

  if (options.json) {
    console.log(formatJson({ project: projectName, conflicts: conflicts.length, actions }));
  } else if (!options.dryRun) {
    const allGood = actions.every((a) => a.success);
    if (allGood) {
      console.log(chalk.green('\nReady. Run your dev server.'));
    } else {
      console.log(chalk.yellow('\nSome conflicts could not be auto-resolved. Check above.'));
    }
  }
}
