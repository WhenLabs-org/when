import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { buildSpawn } from '../utils/find-bin.js';

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
    const s = buildSpawn(bin);

    // Forward all arguments after the subcommand name
    const args = command.args;
    const child = spawn(s.cmd, [...s.args, ...args], {
      stdio: 'inherit',
      env: process.env,
      shell: s.shell,
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
