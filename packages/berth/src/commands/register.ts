import path from 'node:path';
import readline from 'node:readline';
import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { loadRegistry, saveRegistry } from '../registry/store.js';
import { registerProject } from '../registry/project.js';
import { formatJson } from '../reporters/json.js';

interface RegisterOptions extends GlobalOptions {
  dir?: string;
  yes?: boolean;
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

  // Show detected ports
  if (!options.json) {
    console.log(`\nScanning ${chalk.bold(dir)}`);
    console.log(`Detected ports for ${chalk.bold(project.name)}:`);
    for (const p of project.ports) {
      console.log(`  ${chalk.bold(String(p.port))} — ${p.description}`);
    }
    console.log('');
  }

  // Confirm before saving (skip in JSON mode, non-TTY, or --yes)
  if (!options.json && !options.yes && process.stdin.isTTY) {
    const confirmed = await confirm(`Save to registry? (${project.ports.length} port${project.ports.length !== 1 ? 's' : ''})`);
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
  }

  await saveRegistry(updatedRegistry);

  if (options.json) {
    console.log(formatJson({ project: project.name, ports: project.ports }));
  } else {
    console.log(chalk.green(`Registered: ${project.name} → ${project.ports.map((p) => p.port).join(', ')}`));
  }
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}
