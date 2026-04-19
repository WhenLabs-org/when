import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import chalk from 'chalk';
import { parsePolicy } from '../policy/parser.js';
import {
  buildLockfile,
  POLICY_LOCKFILE_NAME,
  readPolicyLockfile,
  writePolicyLockfile,
} from '../policy/lockfile.js';
import { hashPolicyText } from '../policy/cache.js';
import type { PolicyConfig } from '../policy/types.js';

interface CompileOptions {
  path: string;
  policy: string;
  apiKey?: string;
}

interface StatusOptions {
  path: string;
  policy: string;
}

export function registerPolicyCommand(program: Command): void {
  const policy = program
    .command('policy')
    .description('Manage plain-English policy lockfiles');

  policy
    .command('compile')
    .description(`Parse .vow.yml via Claude and write ${POLICY_LOCKFILE_NAME} for offline CI`)
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('--policy <file>', 'Policy file', '.vow.yml')
    .option('--api-key <key>', 'Anthropic API key (or via $ANTHROPIC_API_KEY)')
    .action(async (opts: CompileOptions) => {
      const projectPath = path.resolve(opts.path);
      const policyPath = path.resolve(projectPath, opts.policy);

      let config: PolicyConfig;
      try {
        const content = await readFile(policyPath, 'utf-8');
        config = YAML.parse(content) as PolicyConfig;
      } catch (err) {
        console.error(chalk.red(`Error: could not read policy file at ${policyPath}`));
        console.error(chalk.gray(err instanceof Error ? err.message : String(err)));
        process.exit(2);
      }

      if (!config.policy || typeof config.policy !== 'string') {
        console.error(chalk.red('Error: policy file must contain a "policy" field with text.'));
        process.exit(2);
      }

      console.log(chalk.gray(`Parsing policy from ${opts.policy}...`));
      const parsed = await parsePolicy(config.policy, { apiKey: opts.apiKey });
      const lockfile = buildLockfile(opts.policy, config.policy, parsed);
      await writePolicyLockfile(projectPath, lockfile);

      console.log(
        chalk.green(
          `✓ Wrote ${POLICY_LOCKFILE_NAME} (${parsed.rules.length} rules, hash ${lockfile.sourceHash})`,
        ),
      );
      console.log(
        chalk.gray(
          `  Commit ${POLICY_LOCKFILE_NAME} to run \`vow check --offline\` in CI without ANTHROPIC_API_KEY.`,
        ),
      );
    });

  policy
    .command('status')
    .description(`Report whether ${POLICY_LOCKFILE_NAME} is up-to-date with .vow.yml`)
    .option('-p, --path <dir>', 'Project directory', '.')
    .option('--policy <file>', 'Policy file', '.vow.yml')
    .action(async (opts: StatusOptions) => {
      const projectPath = path.resolve(opts.path);
      const policyPath = path.resolve(projectPath, opts.policy);

      const lockfile = await readPolicyLockfile(projectPath);
      if (!lockfile) {
        console.log(chalk.yellow(`No ${POLICY_LOCKFILE_NAME} — run \`vow policy compile\` to create one.`));
        process.exit(1);
      }

      let text: string;
      try {
        const content = await readFile(policyPath, 'utf-8');
        const config = YAML.parse(content) as PolicyConfig;
        text = typeof config.policy === 'string' ? config.policy : '';
      } catch {
        console.log(chalk.red(`Error: could not read ${opts.policy}`));
        process.exit(2);
      }

      const currentHash = hashPolicyText(text);
      if (currentHash === lockfile.sourceHash) {
        console.log(chalk.green(`✓ ${POLICY_LOCKFILE_NAME} matches ${opts.policy} (hash ${currentHash})`));
        process.exit(0);
      }

      console.log(
        chalk.yellow(
          `✗ ${POLICY_LOCKFILE_NAME} is stale. Policy has changed since last compile.`,
        ),
      );
      console.log(chalk.gray(`  Expected: ${lockfile.sourceHash}`));
      console.log(chalk.gray(`  Actual:   ${currentHash}`));
      console.log(chalk.gray(`  Run \`vow policy compile\` to refresh.`));
      process.exit(1);
    });
}
