import { Command } from 'commander';
import path from 'node:path';
import chalk from 'chalk';
import { executeScan } from './scan.js';
import { evaluatePolicy } from '../policy/evaluator.js';
import { loadJsonPolicy, loadYamlPolicy } from '../policy/json-policy.js';
import { loadIgnoreFile } from '../policy/ignore.js';
import { VowError } from '../errors.js';
import type { ParsedPolicy } from '../policy/types.js';
import { reportCheckResult } from '../reporters/terminal.js';
import { toJSON } from '../reporters/json.js';
import { toMarkdownCheckResult } from '../reporters/markdown.js';

interface CheckOptions {
  path: string;
  policy?: string;
  ci: boolean;
  failOn: string;
  format: string;
  production: boolean;
  output?: string;
  ignore?: string[];
}

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Validate licenses against an allow/deny/warn policy (.vow.json or .vow.yml)')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('--policy <file>', 'Policy file (default: auto-detect .vow.json then .vow.yml)')
    .option('--ci', 'CI mode: exit code 1 on violations', false)
    .option('--fail-on <level>', 'Fail on: block or warn', 'block')
    .option('--ignore <pattern>', 'Glob pattern to exclude packages from policy eval (repeatable)', (val, acc: string[] = []) => [...acc, val], [] as string[])
    .option('-f, --format <fmt>', 'Output format: terminal, json, github, markdown', 'terminal')
    .option('--production', 'Skip devDependencies', false)
    .option('-o, --output <file>', 'Write output to file')
    .action(async (opts: CheckOptions) => {
      const projectPath = path.resolve(opts.path);

      let parsedPolicy: ParsedPolicy;

      if (opts.policy) {
        const policyPath = path.resolve(projectPath, opts.policy);
        const dir = path.dirname(policyPath);
        const loaded = policyPath.endsWith('.json')
          ? await loadJsonPolicy(dir)
          : await loadYamlPolicy(dir);
        if (!loaded) throw new VowError('VOW-E2003', policyPath);
        parsedPolicy = loaded.policy;
      } else {
        const jsonResult = await loadJsonPolicy(projectPath);
        if (jsonResult) {
          parsedPolicy = jsonResult.policy;
          console.log(chalk.gray('Using policy from .vow.json'));
        } else {
          const yamlResult = await loadYamlPolicy(projectPath);
          if (!yamlResult) throw new VowError('VOW-E2001');
          parsedPolicy = yamlResult.policy;
          console.log(chalk.gray('Using policy from .vow.yml'));
        }
      }

      const scanResult = await executeScan({
        path: opts.path,
        production: opts.production,
        format: 'terminal',
      });

      const fileIgnores = await loadIgnoreFile(projectPath);
      const cliIgnores = opts.ignore ?? [];
      const ignorePatterns = [...fileIgnores, ...cliIgnores];

      const checkResult = evaluatePolicy(scanResult, parsedPolicy, {
        overrides: [],
        ignorePatterns,
      });

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

      const shouldFail = opts.failOn === 'warn'
        ? checkResult.blocked.length > 0 || checkResult.warnings.length > 0
        : checkResult.blocked.length > 0;

      if (shouldFail) {
        const detail = `${checkResult.blocked.length} blocked, ${checkResult.warnings.length} warned`;
        throw new VowError('VOW-E1001', detail);
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
