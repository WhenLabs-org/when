import chalk from 'chalk';
import readline from 'node:readline';
import type { GlobalOptions } from '../types.js';
import { killPortProcess, killDevProcesses } from '../resolver/actions.js';
import { detectAllActive } from '../detectors/index.js';
import { parsePortString } from '../utils/ports.js';
import { renderKill } from '../reporters/terminal.js';
import { formatJson } from '../reporters/json.js';

interface KillOptions extends GlobalOptions {
  dev?: boolean;
  force?: boolean;
}

export async function killCommand(portArg: string, options: KillOptions): Promise<void> {
  if (options.dev) {
    if (!options.force && !options.json && process.stdin.isTTY) {
      const { ports } = await detectAllActive();
      const { isDevProcess } = await import('../utils/process.js');
      const devPorts = ports.filter(isDevProcess);

      if (devPorts.length === 0) {
        console.log(chalk.yellow('No dev processes found.'));
        return;
      }

      console.log(`Found ${devPorts.length} dev process${devPorts.length !== 1 ? 'es' : ''}:`);
      for (const p of devPorts) {
        console.log(`  ${p.pid} (${p.process}, port ${p.port})`);
      }

      const confirmed = await confirm('Kill all dev processes?');
      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }
    }

    const result = await killDevProcesses();
    if (options.json) {
      console.log(formatJson(result));
    } else {
      console.log(renderKill(result));
    }
    return;
  }

  const port = parsePortString(portArg);
  if (port === null) {
    console.error(chalk.red(`Invalid port: ${portArg}`));
    process.exitCode = 2;
    return;
  }

  if (!options.force && !options.json && process.stdin.isTTY) {
    const { ports } = await detectAllActive();
    const matching = ports.filter((p) => p.port === port);

    if (matching.length === 0) {
      console.log(chalk.yellow(`No process found on port ${port}.`));
      return;
    }

    for (const p of matching) {
      console.log(`  ${p.pid} (${p.process}) on port ${p.port}`);
    }

    const confirmed = await confirm(`Kill process${matching.length > 1 ? 'es' : ''} on port ${port}?`);
    if (!confirmed) {
      console.log('Cancelled.');
      return;
    }
  }

  const result = await killPortProcess(port);
  if (options.json) {
    console.log(formatJson(result));
  } else {
    console.log(renderKill(result));
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
