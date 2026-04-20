#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { formatVowError, VowError } from './errors.js';
import { registerScanCommand } from './commands/scan.js';
import { registerTreeCommand } from './commands/tree.js';
import { registerExportCommand } from './commands/export.js';
import { registerCheckCommand } from './commands/check.js';
import { registerInitCommand } from './commands/init.js';
import { registerAttributionCommand } from './commands/attribution.js';
import { registerSbomCommand } from './commands/sbom.js';

const program = new Command();

program
  .name('vow')
  .description('Scan dependency licenses and validate against an allow/deny/warn policy')
  .version('0.2.0');

registerScanCommand(program);
registerCheckCommand(program);
registerTreeCommand(program);
registerInitCommand(program);
registerAttributionCommand(program);
registerExportCommand(program);
registerSbomCommand(program);

program.parseAsync().catch((err: Error) => {
  if (err instanceof VowError) {
    console.error(chalk.red(formatVowError(err)));
    if (process.env['VERBOSE'] || process.argv.includes('--verbose')) {
      console.error(err.stack);
    }
    process.exit(err.exitCode);
  }
  console.error(chalk.red('Error:'), err.message);
  if (process.env['VERBOSE'] || process.argv.includes('--verbose')) {
    console.error(err.stack);
  }
  process.exit(2);
});
