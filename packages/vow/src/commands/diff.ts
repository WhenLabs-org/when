import { Command } from 'commander';
import chalk from 'chalk';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { executeScan } from './scan.js';
import { diffScans } from '../diff/engine.js';
import { toDiffMarkdown, toDiffTerminal } from '../reporters/diff.js';
import { VowError } from '../errors.js';
import type { ScanResultJSON } from '../types.js';

interface DiffOptions {
  path: string;
  baseline: string;
  format: 'terminal' | 'markdown' | 'json';
  failOn: 'error' | 'warning' | 'never';
  production: boolean;
  output?: string;
  registry?: boolean;
}

export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .description('Compare a baseline scan against the current project; surface license changes')
    .option('-p, --path <dir>', 'Project directory', '.')
    .requiredOption('--baseline <file>', 'Path to a previous scan JSON (produced by `vow scan -f json`)')
    .option('-f, --format <fmt>', 'Output format: terminal, markdown, json', 'terminal')
    .option('--fail-on <level>', 'Exit non-zero on: error, warning, or never', 'error')
    .option('--production', 'Skip devDependencies', false)
    .option('--no-registry', 'Disable registry API fallback')
    .option('-o, --output <file>', 'Write diff to file (stdout if omitted)')
    .action(async (opts: DiffOptions) => {
      const baselinePath = path.resolve(opts.baseline);
      let baseline: ScanResultJSON;
      try {
        const content = await readFile(baselinePath, 'utf-8');
        baseline = JSON.parse(content) as ScanResultJSON;
      } catch (err) {
        const detail = `${baselinePath} (${err instanceof Error ? err.message : String(err)})`;
        throw new VowError('VOW-E2101', detail);
      }

      const current = await executeScan({
        path: opts.path,
        production: opts.production,
        format: 'terminal',
        registry: opts.registry,
      });

      const diff = diffScans(baseline, current);

      let output: string;
      switch (opts.format) {
        case 'json':
          output = JSON.stringify(diff, null, 2) + '\n';
          break;
        case 'markdown':
          output = toDiffMarkdown(diff);
          break;
        default:
          output = toDiffTerminal(diff);
      }

      if (opts.output) {
        await writeFile(opts.output, output, 'utf-8');
        console.log(chalk.green(`Diff written to ${opts.output}`));
      } else {
        process.stdout.write(output);
      }

      const shouldFail =
        opts.failOn === 'never'
          ? false
          : opts.failOn === 'warning'
            ? diff.summary.errors > 0 || diff.summary.warnings > 0
            : diff.summary.errors > 0;

      if (shouldFail) {
        const detail = `${diff.summary.errors} errors, ${diff.summary.warnings} warnings`;
        throw new VowError('VOW-E1002', detail);
      }
    });
}
