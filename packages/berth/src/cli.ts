import { Command } from 'commander';
import chalk from 'chalk';
import type { GlobalOptions } from './types.js';
import { VERSION } from './version.js';

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
  .description('Show all active ports and Docker ports, with conflicts')
  .option('--trace', 'Resolve process ancestry (parent shell, tmux/screen pane, start time)')
  .option('--mcp', 'Machine-readable envelope with hints for LLM agents (implies --json)')
  .action(async (opts, cmd) => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand({
      ...getGlobalOptions(cmd),
      trace: opts.trace,
      mcp: opts.mcp,
    });
  });

program
  .command('check [dir]')
  .description('Scan a project directory for port conflicts')
  .option('--fix', 'Automatically resolve detected conflicts')
  .option('--mcp', 'Machine-readable envelope with hints for LLM agents (implies --json)')
  .action(async (dir, opts, cmd) => {
    const { checkCommand } = await import('./commands/check.js');
    await checkCommand(dir || '.', {
      ...getGlobalOptions(cmd),
      fix: opts.fix,
      mcp: opts.mcp,
    });
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
  .command('reassign <oldPort> <newPort>')
  .description('Change a port assignment in project config files in cwd')
  .option('--dry-run', 'Show which files would change without writing them')
  .action(async (oldPort, newPort, opts, cmd) => {
    const { reassignCommand } = await import('./commands/reassign.js');
    await reassignCommand(oldPort, newPort, {
      ...getGlobalOptions(cmd),
      dryRun: opts.dryRun,
    });
  });

program
  .command('resolve [dir]')
  .description('Detect and auto-resolve port conflicts')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--kill', 'Allow killing blocking processes')
  .option('-s, --strategy <strategy>', 'Resolution strategy: kill, reassign, or auto', 'auto')
  .action(async (dir, opts, cmd) => {
    const { resolveCommand } = await import('./commands/resolve.js');
    await resolveCommand({
      ...getGlobalOptions(cmd),
      dir: dir || '.',
      dryRun: opts.dryRun,
      kill: opts.kill,
      strategy: opts.strategy,
    });
  });

program
  .command('init')
  .description('Create a berth.config file for the current project')
  .option('-d, --dir <path>', 'Directory to init (default: current)')
  .option('-f, --force', 'Overwrite existing config')
  .option('--format <format>', 'Config format: js, mjs, or json', 'js')
  .action(async (opts, cmd) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand({
      ...getGlobalOptions(cmd),
      dir: opts.dir,
      force: opts.force,
      format: opts.format,
    });
  });

program.parseAsync().catch((err) => {
  console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
