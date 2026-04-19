import { Command } from 'commander';
import { readFile, writeFile, access, chmod } from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

const HOOK_START = '# --- vow license check (start) ---';
const HOOK_END = '# --- vow license check (end) ---';

const HOOK_SCRIPT = `${HOOK_START}
if git diff --cached --name-only | grep -qE '(package\\.json|package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml)'; then
  echo "vow: checking dependency licenses..."
  npx vow check --production 2>&1
  if [ $? -ne 0 ]; then
    echo ""
    echo "vow: license violations found. Fix before committing."
    echo "vow: run 'vow fix' for suggested alternatives."
    exit 1
  fi
fi
${HOOK_END}`;

const SHEBANG = '#!/bin/sh';

interface HookOptions {
  path: string;
}

async function findGitDir(projectPath: string): Promise<string | null> {
  let dir = projectPath;
  while (true) {
    const gitDir = path.join(dir, '.git');
    try {
      await access(gitDir);
      return gitDir;
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
}

async function findPolicyFile(projectPath: string): Promise<string | null> {
  for (const name of ['.vow.json', '.vow.yml']) {
    try {
      await access(path.join(projectPath, name));
      return name;
    } catch {
      // not found
    }
  }
  return null;
}

function hookIsInstalled(content: string): boolean {
  return content.includes(HOOK_START) && content.includes(HOOK_END);
}

export function registerHookCommand(program: Command): void {
  const hookCmd = program
    .command('hook')
    .description('Manage git pre-commit hook for license checking');

  hookCmd
    .command('install')
    .description('Install a git pre-commit hook that runs vow check')
    .option('-p, --path <dir>', 'Project directory', '.')
    .action(async (opts: HookOptions) => {
      const projectPath = path.resolve(opts.path);

      // Verify git repo
      const gitDir = await findGitDir(projectPath);
      if (!gitDir) {
        console.error(chalk.red('Error: Not a git repository (or any parent).'));
        process.exit(1);
      }

      // Warn if no policy file
      const policyFile = await findPolicyFile(projectPath);
      if (!policyFile) {
        console.log(chalk.yellow('Warning: No policy file found (.vow.json or .vow.yml).'));
        console.log(chalk.gray("The hook will skip checks until you create one. Run 'vow init' first."));
      }

      const hooksDir = path.join(gitDir, 'hooks');
      const hookPath = path.join(hooksDir, 'pre-commit');

      // Ensure hooks directory exists
      const { mkdir } = await import('node:fs/promises');
      await mkdir(hooksDir, { recursive: true });

      let existingContent = '';
      try {
        existingContent = await readFile(hookPath, 'utf-8');
      } catch {
        // No existing hook
      }

      // Idempotent: if already installed, skip
      if (hookIsInstalled(existingContent)) {
        console.log(chalk.yellow('vow hook is already installed. No changes made.'));
        return;
      }

      let newContent: string;
      if (existingContent.length === 0) {
        // New hook file
        newContent = `${SHEBANG}\n\n${HOOK_SCRIPT}\n`;
      } else {
        // Append to existing hook
        newContent = `${existingContent.trimEnd()}\n\n${HOOK_SCRIPT}\n`;
      }

      await writeFile(hookPath, newContent, 'utf-8');
      await chmod(hookPath, 0o755);

      console.log(chalk.green('Installed vow pre-commit hook.'));
      console.log(chalk.gray(`  Hook: ${hookPath}`));
      if (policyFile) {
        console.log(chalk.gray(`  Policy: ${policyFile}`));
      }
    });

  hookCmd
    .command('uninstall')
    .description('Remove the vow section from the pre-commit hook')
    .option('-p, --path <dir>', 'Project directory', '.')
    .action(async (opts: HookOptions) => {
      const projectPath = path.resolve(opts.path);

      const gitDir = await findGitDir(projectPath);
      if (!gitDir) {
        console.error(chalk.red('Error: Not a git repository (or any parent).'));
        process.exit(1);
      }

      const hookPath = path.join(gitDir, 'hooks', 'pre-commit');

      let content: string;
      try {
        content = await readFile(hookPath, 'utf-8');
      } catch {
        console.log(chalk.yellow('No pre-commit hook found. Nothing to uninstall.'));
        return;
      }

      if (!hookIsInstalled(content)) {
        console.log(chalk.yellow('vow hook is not installed. Nothing to uninstall.'));
        return;
      }

      // Remove the vow section (including surrounding blank lines)
      const regex = new RegExp(
        `\\n*${escapeRegExp(HOOK_START)}[\\s\\S]*?${escapeRegExp(HOOK_END)}\\n*`,
      );
      let newContent = content.replace(regex, '\n');

      // If only shebang remains, remove the file content entirely
      const stripped = newContent.trim();
      if (stripped === SHEBANG || stripped === '') {
        // Remove the hook file or leave an empty shebang
        await writeFile(hookPath, `${SHEBANG}\n`, 'utf-8');
      } else {
        await writeFile(hookPath, newContent, 'utf-8');
      }

      console.log(chalk.green('Removed vow section from pre-commit hook.'));
      console.log(chalk.gray(`  Hook: ${hookPath}`));
    });

  hookCmd
    .command('status')
    .description('Show whether the vow hook is installed and which policy file it uses')
    .option('-p, --path <dir>', 'Project directory', '.')
    .action(async (opts: HookOptions) => {
      const projectPath = path.resolve(opts.path);

      const gitDir = await findGitDir(projectPath);
      if (!gitDir) {
        console.error(chalk.red('Error: Not a git repository (or any parent).'));
        process.exit(1);
      }

      const hookPath = path.join(gitDir, 'hooks', 'pre-commit');

      let installed = false;
      try {
        const content = await readFile(hookPath, 'utf-8');
        installed = hookIsInstalled(content);
      } catch {
        // No hook file
      }

      const policyFile = await findPolicyFile(projectPath);

      console.log(chalk.bold('vow hook status'));
      console.log();
      console.log(`  Hook installed: ${installed ? chalk.green('yes') : chalk.red('no')}`);
      console.log(`  Hook path:      ${path.join(gitDir, 'hooks', 'pre-commit')}`);
      console.log(`  Policy file:    ${policyFile ? chalk.green(policyFile) : chalk.yellow('none')}`);

      if (!installed) {
        console.log();
        console.log(chalk.gray("  Run 'vow hook install' to set up the pre-commit hook."));
      }
      if (!policyFile) {
        console.log(chalk.gray("  Run 'vow init' to create a policy file."));
      }
    });
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
