import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { freeProjectPorts } from '../resolver/actions.js';
import { loadRegistry } from '../registry/store.js';
import { getProjectByName } from '../registry/project.js';
import { renderKill } from '../reporters/terminal.js';
import { formatJson } from '../reporters/json.js';

export async function freeCommand(projectName: string, options: GlobalOptions): Promise<void> {
  const registry = await loadRegistry();
  const project = getProjectByName(projectName, registry);

  if (!project) {
    console.error(chalk.red(`Project "${projectName}" not found in registry.`));
    console.error('Run `berth list` to see registered projects, or `berth register` to add one.');
    process.exitCode = 2;
    return;
  }

  const result = await freeProjectPorts(projectName, registry);

  if (options.json) {
    console.log(formatJson(result));
  } else {
    if (result.killed.length > 0) {
      console.log(chalk.green(`Freed ports for ${projectName}:`));
    }
    console.log(renderKill(result));
  }
}
