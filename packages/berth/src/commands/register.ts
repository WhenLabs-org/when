import path from 'node:path';
import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { loadRegistry, saveRegistry } from '../registry/store.js';
import { registerProject } from '../registry/project.js';
import { formatJson } from '../reporters/json.js';

interface RegisterOptions extends GlobalOptions {
  dir?: string;
}

export async function registerCommand(options: RegisterOptions): Promise<void> {
  const dir = path.resolve(options.dir || process.cwd());
  const registry = await loadRegistry();

  const { registry: updatedRegistry, project } = await registerProject(dir, registry);

  if (project.ports.length === 0) {
    if (options.json) {
      console.log(formatJson({ project: project.name, ports: [], message: 'No ports detected' }));
    } else {
      console.log(chalk.yellow(`No ports detected in ${dir}`));
      console.log('Make sure your project has a package.json, .env, or docker-compose.yml with port configurations.');
    }
    return;
  }

  await saveRegistry(updatedRegistry);

  if (options.json) {
    console.log(formatJson({ project: project.name, ports: project.ports }));
  } else {
    console.log(chalk.green(`Registered ${project.name} with ${project.ports.length} port${project.ports.length !== 1 ? 's' : ''}:`));
    for (const p of project.ports) {
      console.log(`  ${chalk.bold(String(p.port))} — ${p.description}`);
    }
  }
}
