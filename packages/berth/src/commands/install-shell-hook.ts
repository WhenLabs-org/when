import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import chalk from 'chalk';
import type { GlobalOptions } from '../types.js';
import { formatJson } from '../reporters/json.js';

type Shell = 'bash' | 'zsh' | 'fish';

const MARKER_START = '# >>> berth hook >>>';
const MARKER_END = '# <<< berth hook <<<';

// The hooks run berth in the background so cd latency stays at shell-builtin
// speed. Node cold-start is ~350 ms even with --quick, so blocking the prompt
// would be visible. Backgrounding means any warning prints a few hundred ms
// after the prompt redraws — acceptable UX, zero perceived overhead.
const BASH_HOOK = `${MARKER_START}
# Warns when entering a directory whose configured ports are already held.
__berth_cd_hook() {
  if command -v berth >/dev/null 2>&1; then
    ( berth check --quick --silent 2>/dev/null & ) >/dev/null 2>&1
  fi
}
case ";\${PROMPT_COMMAND:-};" in
  *";__berth_cd_hook;"*) ;;
  *) PROMPT_COMMAND="__berth_cd_hook\${PROMPT_COMMAND:+;\$PROMPT_COMMAND}" ;;
esac
${MARKER_END}`;

const ZSH_HOOK = `${MARKER_START}
# Warns when entering a directory whose configured ports are already held.
__berth_cd_hook() {
  if (( \${+commands[berth]} )); then
    ( berth check --quick --silent 2>/dev/null & ) >/dev/null 2>&1
  fi
}
autoload -Uz add-zsh-hook 2>/dev/null || true
add-zsh-hook chpwd __berth_cd_hook 2>/dev/null || true
${MARKER_END}`;

const FISH_HOOK = `${MARKER_START}
# Warns when entering a directory whose configured ports are already held.
function __berth_cd_hook --on-variable PWD
    if type -q berth
        berth check --quick --silent 2>/dev/null &
        disown 2>/dev/null
    end
end
${MARKER_END}`;

const HOOKS: Record<Shell, string> = {
  bash: BASH_HOOK,
  zsh: ZSH_HOOK,
  fish: FISH_HOOK,
};

interface InstallOptions extends GlobalOptions {
  shell?: Shell;
  print?: boolean;
  uninstall?: boolean;
  rcPath?: string;
}

function detectShell(): Shell | undefined {
  const envShell = process.env.SHELL ?? '';
  if (envShell.includes('zsh')) return 'zsh';
  if (envShell.includes('fish')) return 'fish';
  if (envShell.includes('bash')) return 'bash';
  return undefined;
}

function rcPathFor(shell: Shell): string {
  const home = os.homedir();
  switch (shell) {
    case 'bash':
      return path.join(home, '.bashrc');
    case 'zsh':
      return path.join(home, '.zshrc');
    case 'fish':
      return path.join(home, '.config', 'fish', 'config.fish');
  }
}

function stripMarkers(content: string): string {
  const startIdx = content.indexOf(MARKER_START);
  if (startIdx < 0) return content;
  const endIdx = content.indexOf(MARKER_END, startIdx);
  if (endIdx < 0) return content;
  const before = content.slice(0, startIdx).replace(/\n+$/, '');
  const after = content.slice(endIdx + MARKER_END.length).replace(/^\n+/, '');
  const joined = [before, after].filter(Boolean).join('\n');
  return joined.endsWith('\n') ? joined : joined + (joined ? '\n' : '');
}

function appendHook(content: string, hook: string): string {
  const base = stripMarkers(content); // idempotent — always replace
  const trimmed = base.replace(/\n+$/, '');
  if (!trimmed) return hook + '\n';
  return trimmed + '\n\n' + hook + '\n';
}

export async function installShellHookCommand(options: InstallOptions): Promise<void> {
  const shell = options.shell ?? detectShell();
  if (!shell) {
    if (options.json) {
      console.log(formatJson({ error: 'unknown-shell', SHELL: process.env.SHELL }));
    } else {
      console.error(
        chalk.red(
          `Could not detect shell from $SHELL=${process.env.SHELL ?? '<unset>'}. ` +
            `Pass --shell bash|zsh|fish.`,
        ),
      );
    }
    process.exitCode = 2;
    return;
  }

  const hook = HOOKS[shell];

  if (options.print) {
    console.log(hook);
    return;
  }

  const rcPath = options.rcPath ?? rcPathFor(shell);

  let existing = '';
  try {
    existing = await fs.readFile(rcPath, 'utf-8');
  } catch {
    // File doesn't exist yet — we'll create it.
  }

  if (options.uninstall) {
    if (!existing.includes(MARKER_START)) {
      if (options.json) {
        console.log(formatJson({ removed: false, rcPath }));
      } else {
        console.log(chalk.dim(`No berth hook found in ${rcPath}.`));
      }
      return;
    }
    const next = stripMarkers(existing);
    await fs.mkdir(path.dirname(rcPath), { recursive: true });
    await fs.writeFile(rcPath, next, 'utf-8');
    if (options.json) {
      console.log(formatJson({ removed: true, rcPath }));
    } else {
      console.log(chalk.green(`Removed berth hook from ${rcPath}.`));
    }
    return;
  }

  const next = appendHook(existing, hook);
  await fs.mkdir(path.dirname(rcPath), { recursive: true });
  await fs.writeFile(rcPath, next, 'utf-8');

  if (options.json) {
    console.log(formatJson({ installed: true, shell, rcPath }));
  } else {
    console.log(chalk.green(`Installed berth hook in ${rcPath} (${shell}).`));
    console.log(
      chalk.dim(
        `Open a new shell or run \`source ${path.relative(os.homedir(), rcPath)}\` in your home dir to activate.`,
      ),
    );
  }
}

// Exported for tests.
export const __test__ = { appendHook, stripMarkers, HOOKS, MARKER_START, MARKER_END };
