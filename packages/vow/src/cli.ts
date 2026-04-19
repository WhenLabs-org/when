#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { formatVowError, VowError } from './errors.js';
import { registerScanCommand } from './commands/scan.js';
import { registerTreeCommand } from './commands/tree.js';
import { registerExportCommand } from './commands/export.js';
import { registerCheckCommand } from './commands/check.js';
import { registerFixCommand } from './commands/fix.js';
import { registerInitCommand } from './commands/init.js';
import { registerAttributionCommand } from './commands/attribution.js';
import { registerHookCommand } from './commands/hook.js';
import { registerSbomCommand } from './commands/sbom.js';
import { registerDiffCommand } from './commands/diff.js';
import { registerPolicyCommand } from './commands/policy.js';
import { registerAuditCommand } from './commands/audit.js';

const program = new Command();

program
  .name('vow')
  .description('Scan dependency licenses and validate against plain-English policies')
  .version('0.1.0');

registerScanCommand(program);
registerCheckCommand(program);
registerTreeCommand(program);
registerFixCommand(program);
registerInitCommand(program);
registerAttributionCommand(program);
registerExportCommand(program);
registerHookCommand(program);
registerSbomCommand(program);
registerDiffCommand(program);
registerPolicyCommand(program);
registerAuditCommand(program);

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
