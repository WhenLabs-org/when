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
  .description('Show all active ports, Docker ports, and configured ports')
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
  .option('--quick', 'Use a cached active-port scan (fast path for shell hooks)')
  .option('--silent', 'Only print on error-severity conflicts (pairs with --quick)')
  .action(async (dir, opts, cmd) => {
    const { checkCommand } = await import('./commands/check.js');
    await checkCommand(dir || '.', {
      ...getGlobalOptions(cmd),
      fix: opts.fix,
      mcp: opts.mcp,
      quick: opts.quick,
      silent: opts.silent,
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
  .option('--dry-run', 'Show which files would change without writing them')
  .action(async (oldPort, newPort, opts, cmd) => {
    const { reassignCommand } = await import('./commands/reassign.js');
    await reassignCommand(oldPort, newPort, {
      ...getGlobalOptions(cmd),
      project: opts.project,
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
  .command('start <project>')
  .description('Auto-resolve conflicts and prepare a project')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (project, opts, cmd) => {
    const { startCommand } = await import('./commands/start.js');
    await startCommand(project, { ...getGlobalOptions(cmd), dryRun: opts.dryRun });
  });

program
  .command('predict [dir]')
  .description('Predict port conflicts from project config files before starting')
  .action(async (dir, _opts, cmd) => {
    const { predictCommand } = await import('./commands/predict.js');
    await predictCommand(dir || '.', getGlobalOptions(cmd));
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

program
  .command('reserve <port>')
  .description('Reserve a port for a project so others cannot claim it')
  .requiredOption('--for <project>', 'Project name that owns the reservation')
  .option('--reason <text>', 'Why this port is reserved')
  .option('--expires <duration>', 'TTL like 7d, 3h, 30m')
  .option('-f, --force', 'Override an existing reservation')
  .action(async (port, opts, cmd) => {
    const { reserveCommand } = await import('./commands/reserve.js');
    await reserveCommand(port, {
      ...getGlobalOptions(cmd),
      for: opts.for,
      reason: opts.reason,
      expires: opts.expires,
      force: opts.force,
    });
  });

program
  .command('unreserve <port>')
  .description('Remove a port reservation')
  .action(async (port, _opts, cmd) => {
    const { unreserveCommand } = await import('./commands/unreserve.js');
    await unreserveCommand(port, getGlobalOptions(cmd));
  });

program
  .command('reservations')
  .description('List active port reservations')
  .action(async (_opts, cmd) => {
    const { reservationsCommand } = await import('./commands/reservations.js');
    await reservationsCommand(getGlobalOptions(cmd));
  });

const teamCmd = program
  .command('team')
  .description('Team-wide port assignments via .berth/team.json');

teamCmd
  .command('show')
  .description('Print the merged team config')
  .option('-d, --dir <path>', 'Directory to scan from (default: current)')
  .action(async (opts, cmd) => {
    const { teamShowCommand } = await import('./commands/team.js');
    await teamShowCommand({ ...getGlobalOptions(cmd.parent!), dir: opts.dir });
  });

teamCmd
  .command('lint')
  .description('Validate .berth/team.json; exits 1 on schema error (CI-friendly)')
  .option('-d, --dir <path>', 'Directory to scan from (default: current)')
  .action(async (opts, cmd) => {
    const { teamLintCommand } = await import('./commands/team.js');
    await teamLintCommand({ ...getGlobalOptions(cmd.parent!), dir: opts.dir });
  });

teamCmd
  .command('claim <project> <port>')
  .description('Add (or replace) a team port assignment')
  .option('--role <role>', 'Role label (e.g. web, api)')
  .option('--owner <owner>', 'Owning team or person')
  .option('-d, --dir <path>', 'Directory containing .berth/ (default: current)')
  .action(async (project, port, opts, cmd) => {
    const { teamClaimCommand } = await import('./commands/team.js');
    await teamClaimCommand(project, port, {
      ...getGlobalOptions(cmd.parent!),
      dir: opts.dir,
      role: opts.role,
      owner: opts.owner,
    });
  });

program
  .command('doctor')
  .description('Diagnose your berth setup and surface issues')
  .option('-d, --dir <path>', 'Directory to inspect (default: current)')
  .option('--fix', 'Offer to auto-fix conflicts in cwd via berth resolve')
  .action(async (opts, cmd) => {
    const { doctorCommand } = await import('./commands/doctor.js');
    await doctorCommand({ ...getGlobalOptions(cmd), dir: opts.dir, fix: opts.fix });
  });

program
  .command('install-shell-hook')
  .description('Install a cd hook in your shell rc to warn about port conflicts')
  .option('--shell <shell>', 'bash | zsh | fish (default: auto-detected)')
  .option('--print', 'Print the hook to stdout instead of writing to your rc')
  .option('--uninstall', 'Remove a previously installed hook')
  .option('--rc-path <path>', 'Override the rc file path (for testing or non-standard setups)')
  .action(async (opts, cmd) => {
    const { installShellHookCommand } = await import('./commands/install-shell-hook.js');
    await installShellHookCommand({
      ...getGlobalOptions(cmd),
      shell: opts.shell,
      print: opts.print,
      uninstall: opts.uninstall,
      rcPath: opts.rcPath,
    });
  });

program
  .command('remote <host>')
  .description('Get port status from a remote host via SSH')
  .option('-p, --port <port>', 'SSH port')
  .option('-i, --identity <keyfile>', 'SSH identity file')
  .option('--no-fallback', 'Do not fall back to `ss -tlnp` if remote berth is missing')
  .action(async (host, opts, cmd) => {
    const { remoteCommand } = await import('./commands/remote.js');
    await remoteCommand(host, {
      ...getGlobalOptions(cmd),
      port: opts.port,
      identity: opts.identity,
      fallback: opts.fallback,
    });
  });

program
  .command('history [port]')
  .description('Show port history events (claims, releases, conflicts, resolutions)')
  .option('--since <duration>', 'Only events after this time (e.g. 1h, 7d, ISO date)')
  .option('--limit <n>', 'Max events to show')
  .option('--flapping', 'Show ports with ≥3 claim/release events')
  .option('--type <type>', 'Filter by event type (port-claimed, resolution-applied, ...)')
  .action(async (port, opts, cmd) => {
    const { historyCommand } = await import('./commands/history.js');
    await historyCommand(port, {
      ...getGlobalOptions(cmd),
      since: opts.since,
      limit: opts.limit,
      flapping: opts.flapping,
      type: opts.type,
    });
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
