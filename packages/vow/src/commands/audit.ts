import { Command } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import YAML from 'yaml';
import { executeScan } from './scan.js';
import { evaluatePolicy } from '../policy/evaluator.js';
import { loadJsonPolicy } from '../policy/json-policy.js';
import { loadMatchingLockfile } from '../policy/lockfile.js';
import { loadIgnoreFile } from '../policy/ignore.js';
import { parsePolicy } from '../policy/parser.js';
import { toAuditHtml } from '../reporters/audit.js';
import type { PackageInfo } from '../types.js';
import { pkgKey } from '../types.js';
import type { CheckResult, ParsedPolicy, PolicyConfig, PolicyOverride } from '../policy/types.js';

interface AuditOptions {
  path: string;
  output: string;
  production: boolean;
  registry?: boolean;
  apiKey?: string;
  offline: boolean;
  policy?: string;
  ignore?: string[];
}

export function registerAuditCommand(program: Command): void {
  program
    .command('audit')
    .description('Generate a legal-ready HTML compliance report (scan + policy verdict + license texts)')
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('-o, --output <file>', 'Output HTML file', 'audit.html')
    .option('--production', 'Skip devDependencies', false)
    .option('--no-registry', 'Disable registry API fallback')
    .option('--api-key <key>', 'Anthropic API key (for .vow.yml policies)')
    .option('--offline', 'Require policy.lock.json; never call the Claude API', false)
    .option('--policy <file>', 'Policy file (default: auto-detect .vow.json then .vow.yml)')
    .option('--ignore <pattern>', 'Glob pattern to exclude packages from policy eval (repeatable)', (val, acc: string[] = []) => [...acc, val], [] as string[])
    .action(async (opts: AuditOptions) => {
      const projectPath = path.resolve(opts.path);

      const scan = await executeScan({
        path: opts.path,
        production: opts.production,
        format: 'terminal',
        registry: opts.registry,
      });

      let check: CheckResult | null = null;
      try {
        const loaded = await loadPolicyIfAvailable(projectPath, opts);
        if (loaded) {
          const fileIgnores = await loadIgnoreFile(projectPath);
          const ignorePatterns = [...fileIgnores, ...(opts.ignore ?? [])];
          check = evaluatePolicy(scan, loaded.policy, {
            overrides: loaded.overrides,
            ignorePatterns,
          });
        }
      } catch (err) {
        console.error(
          chalk.yellow(`Policy evaluation skipped: ${err instanceof Error ? err.message : String(err)}`),
        );
      }

      const texts = await collectLicenseTexts(scan.packages, check);

      const html = toAuditHtml(scan, check, { licenseTexts: texts });
      const outputPath = path.resolve(projectPath, opts.output);
      await writeFile(outputPath, html, 'utf-8');

      console.log(chalk.green(`✓ Audit written to ${outputPath}`));
      console.log(
        chalk.gray(
          `  ${scan.summary.total} packages${check ? `, ${check.summary.blocked} blocked, ${check.summary.warnings} warned` : ' (no policy)'}`,
        ),
      );
    });
}

async function loadPolicyIfAvailable(
  projectPath: string,
  opts: AuditOptions,
): Promise<{ policy: ParsedPolicy; overrides: PolicyOverride[] } | null> {
  if (opts.policy) {
    const policyPath = path.resolve(projectPath, opts.policy);
    if (opts.policy.endsWith('.json')) {
      const content = await readFile(policyPath, 'utf-8');
      const raw = JSON.parse(content) as import('../policy/json-policy.js').JsonPolicyFile;
      const { jsonPolicyToParsedPolicy } = await import('../policy/json-policy.js');
      return { policy: jsonPolicyToParsedPolicy(raw), overrides: [] };
    }
    return loadYaml(projectPath, policyPath, opts);
  }

  const json = await loadJsonPolicy(projectPath);
  if (json) return { policy: json.policy, overrides: [] };

  try {
    return await loadYaml(projectPath, path.join(projectPath, '.vow.yml'), opts);
  } catch {
    return null;
  }
}

async function loadYaml(
  projectPath: string,
  policyPath: string,
  opts: AuditOptions,
): Promise<{ policy: ParsedPolicy; overrides: PolicyOverride[] }> {
  const content = await readFile(policyPath, 'utf-8');
  const config = YAML.parse(content) as PolicyConfig;
  if (!config.policy || typeof config.policy !== 'string') {
    throw new Error('Policy file missing "policy" field');
  }

  const lockfileMatch = await loadMatchingLockfile(projectPath, config.policy);
  if (lockfileMatch) {
    return { policy: lockfileMatch, overrides: config.overrides ?? [] };
  }
  if (opts.offline) {
    throw new Error('--offline requires a matching policy.lock.json. Run `vow policy compile`.');
  }
  const parsed = await parsePolicy(config.policy, { apiKey: opts.apiKey });
  return { policy: parsed, overrides: config.overrides ?? [] };
}

const LICENSE_FILE_CANDIDATES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt',
  'LICENSE-MIT', 'LICENSE-APACHE', 'LICENSE-APACHE-2.0',
  'LICENSE.MIT', 'LICENSE.APACHE', 'LICENSE.APACHE-2.0',
  'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'COPYING', 'COPYING.md', 'COPYING.txt',
];

async function collectLicenseTexts(
  packages: PackageInfo[],
  check: CheckResult | null,
): Promise<Map<string, string>> {
  // Include license text for:
  //   - packages with blocked / warned policy verdict (always useful for legal review)
  //   - packages with unknown or custom category (helps reviewer disambiguate)
  // Skip routine allowed permissive packages — they'd blow up the report size.
  const checkByKey = new Map<string, 'allow' | 'warn' | 'block'>();
  if (check) {
    for (const item of check.packages) {
      checkByKey.set(pkgKey(item.pkg.name, item.pkg.version), item.action);
    }
  }

  const texts = new Map<string, string>();
  for (const pkg of packages) {
    const key = pkgKey(pkg.name, pkg.version);
    const action = checkByKey.get(key);
    const interesting =
      action === 'block' ||
      action === 'warn' ||
      pkg.license.category === 'unknown' ||
      pkg.license.category === 'custom';
    if (!interesting) continue;

    const text = await readLicenseText(pkg);
    if (text) texts.set(key, text);
  }
  return texts;
}

async function readLicenseText(pkg: PackageInfo): Promise<string | null> {
  if (pkg.license.licenseText) return pkg.license.licenseText;

  if (pkg.license.licenseFilePath) {
    try {
      const content = await readFile(pkg.license.licenseFilePath, 'utf-8');
      return content.slice(0, 20_000);
    } catch {
      // fall through
    }
  }

  if (pkg.path) {
    for (const name of LICENSE_FILE_CANDIDATES) {
      try {
        const content = await readFile(path.join(pkg.path, name), 'utf-8');
        return content.slice(0, 20_000);
      } catch {
        // next
      }
    }
  }

  return null;
}
