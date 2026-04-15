import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findBin(name: string): string | null {
  // Look in node_modules/.bin relative to this package
  const localBin = resolve(__dirname, '..', '..', 'node_modules', '.bin', name);
  if (existsSync(localBin)) return localBin;

  // Fallback: try to resolve from PATH
  return name;
}

export function createDelegateCommand(
  name: string,
  description: string,
  binName?: string,
): Command {
  const cmd = new Command(name);
  cmd.description(description);
  cmd.allowUnknownOption(true);
  cmd.allowExcessArguments(true);
  cmd.helpOption(false); // Let the child tool handle --help

  cmd.action((_options, command: Command) => {
    const bin = binName ?? name;
    const binPath = findBin(bin);

    if (!binPath) {
      console.error(`Error: '${bin}' is not installed. Run: npm install -g @whenlabs/${name}`);
      process.exit(1);
    }

    // Forward all arguments after the subcommand name
    const args = command.args;
    const child = spawn(binPath, args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', (err) => {
      console.error(`Failed to run '${bin}': ${err.message}`);
      process.exit(1);
    });

    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  });

  return cmd;
}
