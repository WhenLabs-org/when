import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { parsePortString } from '../utils/ports.js';
import { reassignPort } from '../resolver/actions.js';
import { loadRegistry, saveRegistry } from '../registry/store.js';
import { getProjectByName } from '../registry/project.js';
import { formatJson } from '../reporters/json.js';

interface ReassignOptions extends GlobalOptions {
  project?: string;
}

export async function reassignCommand(
  oldPortStr: string,
  newPortStr: string,
  options: ReassignOptions,
): Promise<void> {
  const oldPort = parsePortString(oldPortStr);
  const newPort = parsePortString(newPortStr);

  if (oldPort === null || newPort === null) {
    console.error(chalk.red('Invalid port number(s).'));
    process.exitCode = 2;
    return;
  }

  if (oldPort === newPort) {
    console.error(chalk.red('Old and new ports are the same.'));
    process.exitCode = 2;
    return;
  }

  let projectDir: string | null = null;

  if (options.project) {
    const registry = await loadRegistry();
    const project = getProjectByName(options.project, registry);
    if (!project) {
      console.error(chalk.red(`Project "${options.project}" not found in registry.`));
      process.exitCode = 2;
      return;
    }
    projectDir = project.directory;
  } else {
    projectDir = process.cwd();
  }

  const result = await reassignPort(projectDir, oldPort, newPort);

  // Update registry if project is registered
  if (options.project) {
    const registry = await loadRegistry();
    const project = registry.projects[options.project];
    if (project) {
      project.ports = project.ports.map((p) =>
        p.port === oldPort ? { ...p, port: newPort } : p,
      );
      project.updatedAt = new Date().toISOString();
      await saveRegistry(registry);
    }
  }

  if (options.json) {
    console.log(formatJson({ oldPort, newPort, filesModified: result.filesModified }));
  } else {
    if (result.filesModified.length > 0) {
      console.log(chalk.green(`Reassigned port ${oldPort} → ${newPort}`));
      console.log('Modified files:');
      for (const f of result.filesModified) {
        console.log(`  ${f}`);
      }
    } else {
      console.log(chalk.yellow(`No files found containing port ${oldPort}.`));
    }
  }
}
