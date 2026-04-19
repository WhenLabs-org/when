#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanCommand } from './commands/scan.js';
import { initCommand } from './commands/init.js';
import { watchCommand } from './commands/watch.js';
import { fixCommand } from './commands/fix.js';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  // Built from src/cli.ts → dist/src/cli.js, so walk up two dirs.
  // In dev (tsx) we're still at src/, so one dir up works. Try both.
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
  .command('fix')
  .description('Generate fix suggestions for drift issues')
  .option('-f, --format <format>', 'Output format: terminal, diff', 'terminal')
  .option('--apply', 'Apply high-confidence fixes to files')
  .option('--dry-run', 'Show what --apply would change without writing (default when using --apply)')
  .option('--no-dry-run', 'Actually write changes when using --apply')
  .option('-c, --config <path>', 'Path to config file')
  .option('-p, --path <path>', 'Project path (default: current directory)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (options) => {
    try {
      await fixCommand(options);
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
