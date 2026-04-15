import { Command } from 'commander';
import { createDelegateCommand } from './commands/delegate.js';
import { createDoctorCommand } from './commands/doctor.js';
import { createInitCommand } from './commands/init.js';

const program = new Command();

program
  .name('when')
  .version('0.1.0')
  .description('The WhenLabs developer toolkit — 6 tools, one install');

// Install / uninstall
program
  .command('install')
  .description('Install all WhenLabs tools globally (MCP server + CLAUDE.md instructions)')
  .option('--cursor', 'Install MCP servers into Cursor (~/.cursor/mcp.json)')
  .option('--vscode', 'Install MCP servers into VS Code (settings.json)')
  .option('--windsurf', 'Install MCP servers into Windsurf (~/.codeium/windsurf/mcp_config.json)')
  .option('--all', 'Install MCP servers into all supported editors')
  .action(async (options) => {
    const { install } = await import('./commands/install.js');
    await install(options);
  });

program
  .command('uninstall')
  .description('Remove all WhenLabs tools')
  .option('--cursor', 'Remove MCP servers from Cursor')
  .option('--vscode', 'Remove MCP servers from VS Code')
  .option('--windsurf', 'Remove MCP servers from Windsurf')
  .option('--all', 'Remove MCP servers from all supported editors')
  .action(async (options) => {
    const { uninstall } = await import('./commands/uninstall.js');
    await uninstall(options);
  });

program
  .command('status')
  .description('Show installation status and velocity stats')
  .action(async () => {
    const { status } = await import('./commands/status.js');
    await status();
  });

program
  .command('ci')
  .description('Run stale, envalid, and vow checks — exits 1 if any tool finds issues')
  .option('--ci', 'Output GitHub Actions annotations (::error file=X::message)')
  .option('--json', 'Machine-readable JSON output')
  .action(async (options) => {
    const { ci } = await import('./commands/ci.js');
    await ci(options);
  });

program.addCommand(createInitCommand());
program.addCommand(createDoctorCommand());

// Delegate commands for each tool
program.addCommand(createDelegateCommand('stale', 'Detect documentation drift in your codebase'));
program.addCommand(createDelegateCommand('envalid', 'Validate .env files against a type-safe schema'));
program.addCommand(createDelegateCommand('berth', 'Detect and resolve port conflicts'));
program.addCommand(createDelegateCommand('aware', 'Auto-detect your stack and generate AI context files'));
program.addCommand(createDelegateCommand('vow', 'Scan dependency licenses and validate against policies'));
program.addCommand(createDelegateCommand('velocity', 'velocity-mcp task timing server', 'velocity-mcp'));

program.parse();
