import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import chalk from 'chalk';
import ora from 'ora';
import { executeScan } from './scan.js';
import { parsePolicy } from '../policy/parser.js';
import { evaluatePolicy } from '../policy/evaluator.js';
import { loadJsonPolicy } from '../policy/json-policy.js';
import type { PolicyConfig } from '../policy/types.js';
import type { ParsedPolicy } from '../policy/types.js';
import { reportFixSuggestions, type FixSuggestion } from '../reporters/terminal.js';

interface FixOptions {
  path: string;
  policy: string;
  apiKey?: string;
  production: boolean;
  limit: number;
}

export interface AlternativePackage {
  name: string;
  version: string;
  license: string;
  weeklyDownloads: number;
  description: string;
}

const PERMISSIVE_LICENSES = new Set([
  'MIT', 'Apache-2.0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause',
  'Unlicense', 'CC0-1.0', '0BSD', 'BlueOak-1.0.0',
]);

export async function findAlternatives(
  packageName: string,
  options: { limit?: number; allowedLicenses?: Set<string> } = {},
): Promise<AlternativePackage[]> {
  const limit = options.limit ?? 3;
  const allowed = options.allowedLicenses ?? PERMISSIVE_LICENSES;

  // Extract search keywords from package name
  const keywords = packageName
    .replace(/^@[^/]+\//, '') // remove scope
    .split(/[-_.]/)
    .filter(w => w.length > 2)
    .join('+');

  if (!keywords) return [];

  try {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(keywords)}&size=20`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json() as {
      objects: Array<{
        package: {
          name: string;
          version: string;
          description?: string;
          links?: { npm?: string };
        };
        score?: { detail?: { popularity?: number } };
      }>;
    };

    const alternatives: AlternativePackage[] = [];

    for (const obj of data.objects) {
      const pkg = obj.package;
      // Skip the original package
      if (pkg.name === packageName) continue;

      // Get license from npm registry
      try {
        const pkgUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/latest`;
        const pkgResponse = await fetch(pkgUrl);
        if (!pkgResponse.ok) continue;

        const pkgData = await pkgResponse.json() as { license?: string };
        const license = pkgData.license ?? 'UNKNOWN';

        if (!allowed.has(license)) continue;

        // Estimate downloads from popularity score
        const popularity = obj.score?.detail?.popularity ?? 0;
        const estimatedDownloads = Math.round(popularity * 5_000_000);

        alternatives.push({
          name: pkg.name,
          version: pkg.version,
          license,
          weeklyDownloads: estimatedDownloads,
          description: pkg.description ?? '',
        });

        if (alternatives.length >= limit) break;
      } catch {
        continue;
      }
    }

    return alternatives.sort((a, b) => b.weeklyDownloads - a.weeklyDownloads);
  } catch {
    return [];
  }
}

export function registerFixCommand(program: Command): void {
  program
    .command('fix')
    .description('Suggest alternative packages for policy violations')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('--policy <file>', 'Policy file (default: auto-detect .vow.json then .vow.yml)')
    .option('--api-key <key>', 'Anthropic API key')
    .option('--production', 'Skip devDependencies', false)
    .option('-l, --limit <n>', 'Max alternatives per package', parseInt, 3)
    .action(async (opts: FixOptions) => {
      const projectPath = path.resolve(opts.path);

      // Auto-detect policy file: .vow.json first, then .vow.yml
      let policyPath: string;
      if (opts.policy && opts.policy !== '.vow.yml') {
        // Explicit policy file provided
        policyPath = path.resolve(projectPath, opts.policy);
      } else {
        const jsonPath = path.resolve(projectPath, '.vow.json');
        const yamlPath = path.resolve(projectPath, '.vow.yml');
        try {
          await readFile(jsonPath);
          policyPath = jsonPath;
        } catch {
          policyPath = yamlPath;
        }
      }

      // Read policy
      let policyConfig: PolicyConfig;
      try {
        const content = await readFile(policyPath, 'utf-8');
        // Support both JSON and YAML formats
        if (policyPath.endsWith('.json')) {
          policyConfig = JSON.parse(content) as PolicyConfig;
        } else {
          policyConfig = YAML.parse(content) as PolicyConfig;
        }
      } catch {
        console.error(chalk.red(`Error: Could not read policy file: ${policyPath}`));
        console.error(chalk.gray('Create one with: vow init'));
        process.exit(2);
      }

      // Parse policy — support both YAML (plain-English) and JSON (allowed/denied arrays) formats
      let parsedPolicy: ParsedPolicy;
      if (policyPath.endsWith('.json')) {
        const jsonResult = await loadJsonPolicy(projectPath);
        if (!jsonResult) {
          console.error(chalk.red('Error: Could not parse .vow.json policy file.'));
          process.exit(2);
        }
        parsedPolicy = jsonResult.policy;
      } else {
        if (!policyConfig.policy) {
          console.error(chalk.red('Error: YAML policy file must contain a "policy" field.'));
          process.exit(2);
        }
        parsedPolicy = await parsePolicy(policyConfig.policy, { apiKey: opts.apiKey });
      }

      const scanResult = await executeScan({ path: opts.path, production: opts.production, format: 'terminal' });
      const checkResult = evaluatePolicy(scanResult, parsedPolicy, policyConfig.overrides ?? []);

      const violations = [...checkResult.blocked, ...checkResult.warnings];

      if (violations.length === 0) {
        console.log(chalk.green('No policy violations found!'));
        return;
      }

      const spinner = ora('Finding alternative packages...').start();
      const suggestions: FixSuggestion[] = [];

      for (const violation of violations) {
        spinner.text = `Finding alternatives for ${violation.pkg.name}...`;
        const alts = await findAlternatives(violation.pkg.name, { limit: opts.limit });

        suggestions.push({
          packageName: violation.pkg.name,
          packageVersion: violation.pkg.version,
          license: violation.pkg.license.spdxExpression ?? 'UNKNOWN',
          alternatives: alts,
        });
      }

      spinner.stop();
      console.log(reportFixSuggestions(suggestions));
    });
}
