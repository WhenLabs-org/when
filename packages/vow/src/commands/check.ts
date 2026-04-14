import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import chalk from 'chalk';
import { executeScan } from './scan.js';
import { parsePolicy } from '../policy/parser.js';
import { evaluatePolicy } from '../policy/evaluator.js';
import type { PolicyConfig } from '../policy/types.js';
import { reportCheckResult } from '../reporters/terminal.js';
import { toJSON } from '../reporters/json.js';
import { toMarkdownCheckResult } from '../reporters/markdown.js';

interface CheckOptions {
  path: string;
  policy: string;
  ci: boolean;
  failOn: string;
  apiKey?: string;
  format: string;
  production: boolean;
  output?: string;
}

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Validate licenses against a plain-English policy')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('--policy <file>', 'Policy file', '.vow.yml')
    .option('--ci', 'CI mode: exit code 1 on violations', false)
    .option('--fail-on <level>', 'Fail on: block or warn', 'block')
    .option('--api-key <key>', 'Anthropic API key')
    .option('-f, --format <fmt>', 'Output format: terminal, json, github, markdown', 'terminal')
    .option('--production', 'Skip devDependencies', false)
    .option('-o, --output <file>', 'Write output to file')
    .action(async (opts: CheckOptions) => {
      const projectPath = path.resolve(opts.path);
      const policyPath = path.resolve(projectPath, opts.policy);

      // Read policy file
      let policyConfig: PolicyConfig;
      try {
        const content = await readFile(policyPath, 'utf-8');
        policyConfig = YAML.parse(content) as PolicyConfig;
      } catch (err) {
        console.error(chalk.red(`Error: Could not read policy file: ${policyPath}`));
        console.error(chalk.gray('Run `vow init` to create one.'));
        process.exit(2);
      }

      if (!policyConfig.policy || typeof policyConfig.policy !== 'string') {
        console.error(chalk.red('Error: Policy file must contain a "policy" field with text.'));
        process.exit(2);
      }

      // Parse policy
      let parsedPolicy;
      try {
        parsedPolicy = await parsePolicy(policyConfig.policy, {
          apiKey: opts.apiKey,
        });
        console.log(chalk.gray(`Policy parsed: ${parsedPolicy.rules.length} rules`));
      } catch (err) {
        console.error(chalk.red('Error parsing policy:'), (err as Error).message);
        process.exit(2);
      }

      // Scan
      const scanResult = await executeScan({
        path: opts.path,
        production: opts.production,
        format: 'terminal',
      });

      // Evaluate
      const checkResult = evaluatePolicy(
        scanResult,
        parsedPolicy,
        policyConfig.overrides ?? [],
      );

      // Output
      let output: string;
      switch (opts.format) {
        case 'json':
          output = toJSON(checkResult, true);
          break;
        case 'markdown':
          output = toMarkdownCheckResult(checkResult);
          break;
        case 'github':
          output = formatGitHubAnnotations(checkResult);
          break;
        default:
          output = reportCheckResult(checkResult);
      }

      if (opts.output) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(opts.output, output, 'utf-8');
        console.log(`Report written to ${opts.output}`);
      } else {
        console.log(output);
      }

      // Exit code
      if (opts.ci || opts.failOn) {
        const shouldFail = opts.failOn === 'warn'
          ? checkResult.blocked.length > 0 || checkResult.warnings.length > 0
          : checkResult.blocked.length > 0;

        if (shouldFail) {
          process.exit(1);
        }
      }
    });
}

function formatGitHubAnnotations(result: import('../policy/types.js').CheckResult): string {
  const lines: string[] = [];

  for (const item of result.blocked) {
    const license = item.pkg.license.spdxExpression ?? 'UNKNOWN';
    const msg = `${item.pkg.name}@${item.pkg.version} uses ${license} license`;
    lines.push(`::error file=package-lock.json::${msg}`);
  }

  for (const item of result.warnings) {
    const license = item.pkg.license.spdxExpression ?? 'UNKNOWN';
    const msg = `${item.pkg.name}@${item.pkg.version} uses ${license} license`;
    lines.push(`::warning file=package-lock.json::${msg}`);
  }

  return lines.join('\n');
}
