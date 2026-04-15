#!/usr/bin/env node

import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { initCommand } from './commands/init.js';
import { watchCommand } from './commands/watch.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('stale')
  .description('Detect documentation drift in your codebase')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan for documentation drift')
  .option('-d, --deep', 'Enable AI-powered deep analysis (requires STALE_AI_KEY)')
  .option('-g, --git', 'Enable git history staleness checks')
  .option('-f, --format <format>', 'Output format: terminal, json, markdown, sarif', 'terminal')
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

program
  .command('watch')
  .description('Watch for changes and re-scan automatically')
  .option('-f, --format <format>', 'Output format', 'terminal')
  .option('-c, --config <path>', 'Path to config file')
  .option('-p, --path <path>', 'Project path (default: current directory)')
  .action(async (options) => {
    try {
      await watchCommand(options);
    } catch (err: unknown) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program.parse();
