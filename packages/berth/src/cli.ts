import { Command } from 'commander';
import chalk from 'chalk';
import type { GlobalOptions } from './types.js';

const VERSION = '0.1.0';

function getGlobalOptions(cmd: Command): GlobalOptions {
  const opts = cmd.optsWithGlobals();
  const noColor = !opts.color;
  if (noColor) chalk.level = 0;
  return {
    json: opts.json ?? false,
    verbose: opts.verbose ?? false,
    noColor,
  };
}

const program = new Command();

program
  .name('berth')
  .description('Port & Process Conflict Resolver for Developers')
  .version(VERSION)
  .option('--json', 'Output in JSON format')
  .option('--verbose', 'Show detailed output')
  .option('--no-color', 'Disable colored output');

program
  .command('status')
  .description('Show all active ports, Docker ports, and configured ports')
  .action(async (_opts, cmd) => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand(getGlobalOptions(cmd));
  });

program
  .command('check [dir]')
  .description('Scan a project directory for port conflicts')
  .action(async (dir, _opts, cmd) => {
    const { checkCommand } = await import('./commands/check.js');
    await checkCommand(dir || '.', getGlobalOptions(cmd));
  });

program
  .command('kill [port]')
  .description('Kill processes on a port, or all dev processes with --dev')
  .option('--dev', 'Kill all dev processes')
  .option('-f, --force', 'Skip confirmation')
  .action(async (port, opts, cmd) => {
    const { killCommand } = await import('./commands/kill.js');
    await killCommand(port ?? null, { ...getGlobalOptions(cmd), dev: opts.dev, force: opts.force });
  });

program
  .command('free <project>')
  .description('Free all ports for a registered project')
  .action(async (project, _opts, cmd) => {
    const { freeCommand } = await import('./commands/free.js');
    await freeCommand(project, getGlobalOptions(cmd));
  });

program
  .command('register')
  .description('Register current directory\'s port requirements')
  .option('-d, --dir <path>', 'Directory to register (default: current)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (opts, cmd) => {
    const { registerCommand } = await import('./commands/register.js');
    await registerCommand({ ...getGlobalOptions(cmd), dir: opts.dir, yes: opts.yes });
  });

program
  .command('list')
  .description('List all registered projects and their statuses')
  .action(async (_opts, cmd) => {
    const { listCommand } = await import('./commands/list.js');
    await listCommand(getGlobalOptions(cmd));
  });

program
  .command('reassign <oldPort> <newPort>')
  .description('Change a port assignment in project config files')
  .option('-p, --project <name>', 'Project name from registry')
  .action(async (oldPort, newPort, opts, cmd) => {
    const { reassignCommand } = await import('./commands/reassign.js');
    await reassignCommand(oldPort, newPort, { ...getGlobalOptions(cmd), project: opts.project });
  });

program
  .command('start <project>')
  .description('Auto-resolve conflicts and prepare a project')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (project, opts, cmd) => {
    const { startCommand } = await import('./commands/start.js');
    await startCommand(project, { ...getGlobalOptions(cmd), dryRun: opts.dryRun });
  });

program
  .command('watch')
  .description('Monitor for port conflicts in real-time')
  .option('-i, --interval <seconds>', 'Polling interval in seconds', '5')
  .option('-n, --notify', 'Send desktop notifications on new conflicts')
  .action(async (opts, cmd) => {
    const { watchCommand } = await import('./commands/watch.js');
    await watchCommand({ ...getGlobalOptions(cmd), interval: parseInt(opts.interval, 10), notify: opts.notify });
  });

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof Error) {
      if (program.opts().verbose) {
        console.error(err.stack);
      } else {
        console.error(`Error: ${err.message}`);
      }
    }
    process.exitCode = 2;
  }
}

main();
