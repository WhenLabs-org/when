import { Command } from 'commander';
import { createDoctorCommand } from './commands/doctor.js';
import { createInitCommand } from './commands/init.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

program
  .name('when')
  .version(version)
  .description('The WhenLabs developer toolkit — 6 tools, one install');

program
  .command('install')
  .description('Install the WhenLabs MCP server into Claude Code (~/.claude.json + CLAUDE.md + skill file)')
  .option('--no-skill', 'Skip writing the whenlabs skill file to ~/.claude/skills/whenlabs/SKILL.md')
  .action(async (options: { skill?: boolean }) => {
    const { install } = await import('./commands/install.js');
    await install({ skill: options.skill });
  });

program
  .command('uninstall')
  .description('Remove the WhenLabs MCP server from Claude Code')
  .action(async () => {
    const { uninstall } = await import('./commands/uninstall.js');
    await uninstall();
  });

program.addCommand(createInitCommand());
program.addCommand(createDoctorCommand());

program.parse();
