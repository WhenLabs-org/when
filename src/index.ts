import { Command } from 'commander';
import { createDelegateCommand } from './commands/delegate.js';

const program = new Command();

program
  .name('when')
  .version('0.1.0')
  .description('The WhenLabs developer toolkit — 6 tools, one install');

// Install / uninstall (stubs for now — will be implemented next)
program
  .command('install')
  .description('Install all WhenLabs tools globally (MCP server + CLAUDE.md instructions)')
  .action(async () => {
    const { install } = await import('./commands/install.js');
    await install();
  });

program
  .command('uninstall')
  .description('Remove all WhenLabs tools')
  .action(async () => {
    const { uninstall } = await import('./commands/uninstall.js');
    await uninstall();
  });

program
  .command('status')
  .description('Show installation status and velocity stats')
  .action(async () => {
    const { status } = await import('./commands/status.js');
    await status();
  });

// Delegate commands for each tool
program.addCommand(createDelegateCommand('stale', 'Detect documentation drift in your codebase'));
program.addCommand(createDelegateCommand('envalid', 'Validate .env files against a type-safe schema'));
program.addCommand(createDelegateCommand('berth', 'Detect and resolve port conflicts'));
program.addCommand(createDelegateCommand('aware', 'Auto-detect your stack and generate AI context files'));
program.addCommand(createDelegateCommand('vow', 'Scan dependency licenses and validate against policies'));
program.addCommand(createDelegateCommand('velocity', 'velocity-mcp task timing server', 'velocity-mcp'));

program.parse();
