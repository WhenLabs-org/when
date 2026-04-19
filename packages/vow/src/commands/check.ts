import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import chalk from 'chalk';
import { executeScan } from './scan.js';
import { parsePolicy } from '../policy/parser.js';
import { evaluatePolicy } from '../policy/evaluator.js';
import { loadJsonPolicy } from '../policy/json-policy.js';
import { loadMatchingLockfile, POLICY_LOCKFILE_NAME, readPolicyLockfile } from '../policy/lockfile.js';
import { hashPolicyText } from '../policy/cache.js';
import { loadIgnoreFile } from '../policy/ignore.js';
import { VowError } from '../errors.js';
import type { PolicyConfig } from '../policy/types.js';
import type { ParsedPolicy, PolicyOverride } from '../policy/types.js';
import { reportCheckResult } from '../reporters/terminal.js';
import { toJSON } from '../reporters/json.js';
import { toMarkdownCheckResult } from '../reporters/markdown.js';

interface CheckOptions {
  path: string;
  policy: string;
  ci: boolean;
  failOn: string;
  apiKey?: string;
  offline: boolean;
  format: string;
  production: boolean;
  output?: string;
  ignore?: string[];
}

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Validate licenses against a policy (supports .vow.json and .vow.yml)')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('--policy <file>', 'Policy file (default: auto-detect .vow.json then .vow.yml)')
    .option('--ci', 'CI mode: exit code 1 on violations', false)
    .option('--fail-on <level>', 'Fail on: block or warn', 'block')
    .option('--api-key <key>', 'Anthropic API key')
    .option('--offline', `Require a committed ${POLICY_LOCKFILE_NAME}; never call the Claude API`, false)
    .option('--ignore <pattern>', 'Glob pattern to exclude packages from policy eval (repeatable)', (val, acc: string[] = []) => [...acc, val], [] as string[])
    .option('-f, --format <fmt>', 'Output format: terminal, json, github, markdown', 'terminal')
    .option('--production', 'Skip devDependencies', false)
    .option('-o, --output <file>', 'Write output to file')
    .action(async (opts: CheckOptions) => {
      const projectPath = path.resolve(opts.path);

      let parsedPolicy: ParsedPolicy;
      let overrides: PolicyOverride[] = [];

      // Try to load policy - auto-detect .vow.json first, then .vow.yml
      if (opts.policy) {
        // Explicit policy file specified
        const policyPath = path.resolve(projectPath, opts.policy);
        if (opts.policy.endsWith('.json')) {
          const result = await loadJsonPolicyFromPath(policyPath);
          parsedPolicy = result.policy;
        } else {
          const result = await loadYamlPolicy(
            projectPath,
            policyPath,
            opts.apiKey,
            opts.offline,
          );
          parsedPolicy = result.policy;
          overrides = result.overrides;
        }
      } else {
        // Auto-detect: try .vow.json first
        const jsonResult = await loadJsonPolicy(projectPath);
        if (jsonResult) {
          parsedPolicy = jsonResult.policy;
          console.log(chalk.gray('Using policy from .vow.json'));
        } else {
          // Fall back to .vow.yml
          const yamlPath = path.resolve(projectPath, '.vow.yml');
          const result = await loadYamlPolicy(projectPath, yamlPath, opts.apiKey, opts.offline);
          parsedPolicy = result.policy;
          overrides = result.overrides;
          console.log(chalk.gray('Using policy from .vow.yml'));
        }
      }

      // Scan
      const scanResult = await executeScan({
        path: opts.path,
        production: opts.production,
        format: 'terminal',
      });

      // Load ignore patterns from .vowignore + CLI
      const fileIgnores = await loadIgnoreFile(projectPath);
      const cliIgnores = opts.ignore ?? [];
      const ignorePatterns = [...fileIgnores, ...cliIgnores];

      // Evaluate
      const checkResult = evaluatePolicy(scanResult, parsedPolicy, {
        overrides,
        ignorePatterns,
      });

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

      // Exit code — always exit 1 on violations (CI gate behavior)
      const shouldFail = opts.failOn === 'warn'
        ? checkResult.blocked.length > 0 || checkResult.warnings.length > 0
        : checkResult.blocked.length > 0;

      if (shouldFail) {
        const detail = `${checkResult.blocked.length} blocked, ${checkResult.warnings.length} warned`;
        throw new VowError('VOW-E1001', detail);
      }
    });
}

async function loadJsonPolicyFromPath(filePath: string): Promise<{ policy: ParsedPolicy }> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    throw new VowError('VOW-E2003', filePath);
  }

  const { jsonPolicyToParsedPolicy } = await import('../policy/json-policy.js');
  const raw = JSON.parse(content) as import('../policy/json-policy.js').JsonPolicyFile;
  return { policy: jsonPolicyToParsedPolicy(raw) };
}

async function loadYamlPolicy(
  projectPath: string,
  policyPath: string,
  apiKey: string | undefined,
  offline: boolean,
): Promise<{ policy: ParsedPolicy; overrides: PolicyOverride[] }> {
  let policyConfig: PolicyConfig;
  try {
    const content = await readFile(policyPath, 'utf-8');
    policyConfig = YAML.parse(content) as PolicyConfig;
  } catch {
    throw new VowError('VOW-E2001');
  }

  if (!policyConfig.policy || typeof policyConfig.policy !== 'string') {
    throw new VowError('VOW-E2002', policyPath);
  }

  // Try a committed lockfile first (offline-safe, hash-pinned).
  const fromLockfile = await loadMatchingLockfile(projectPath, policyConfig.policy);
  if (fromLockfile) {
    console.log(
      chalk.gray(`Using pre-parsed policy from ${POLICY_LOCKFILE_NAME} (${fromLockfile.rules.length} rules)`),
    );
    return { policy: fromLockfile, overrides: policyConfig.overrides ?? [] };
  }

  if (offline) {
    const stale = await readPolicyLockfile(projectPath);
    const detail = stale
      ? `${POLICY_LOCKFILE_NAME} is stale (sourceHash ${stale.sourceHash} ≠ ${hashPolicyText(policyConfig.policy)})`
      : `${POLICY_LOCKFILE_NAME} not found in project root`;
    throw new VowError('VOW-E2005', detail);
  }

  let parsedPolicy: ParsedPolicy;
  try {
    parsedPolicy = await parsePolicy(policyConfig.policy, { apiKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/api key/i.test(msg) || /ANTHROPIC_API_KEY/i.test(msg)) {
      throw new VowError('VOW-E2004');
    }
    throw err;
  }
  console.log(chalk.gray(`Policy parsed: ${parsedPolicy.rules.length} rules`));

  return {
    policy: parsedPolicy,
    overrides: policyConfig.overrides ?? [],
  };
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
