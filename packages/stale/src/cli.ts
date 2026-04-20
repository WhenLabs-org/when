#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanCommand } from './commands/scan.js';
import { initCommand } from './commands/init.js';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  for (const rel of ['../../package.json', '../package.json']) {
    try {
      const raw = readFileSync(join(__dirname, rel), 'utf-8');
      return (JSON.parse(raw) as { version: string }).version;
    } catch {
      // try next candidate
    }
  }
  return '0.0.0';
}
const pkg = { version: readVersion() };

const program = new Command();

program
  .name('stale')
  .description('Detect documentation drift in your codebase')
  .version(pkg.version)
  .option('--no-color', 'Disable colored output');

program
  .command('scan')
  .description('Scan for documentation drift')
  .option('-g, --git', 'Enable git history staleness checks')
  .option('-f, --format <format>', 'Output format: terminal, json, markdown', 'terminal')
  .option('-c, --config <path>', 'Path to config file')
  .option('-p, --path <path>', 'Project path (default: current directory)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      await scanCommand(options);
    } catch (err: unknown) {
      if (options.verbose) {
        console.error(err);
      } else {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
      }
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Generate a .stale.yml config file')
  .action(async () => {
    try {
      await initCommand();
    } catch (err: unknown) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program.parse();
