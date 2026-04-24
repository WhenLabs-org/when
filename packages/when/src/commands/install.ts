import { execFileSync } from 'node:child_process';
import { registerMcpServer } from '../utils/mcp-config.js';
import { injectBlock, CLAUDE_MD_PATH } from '../utils/claude-md.js';
import { writeSkillFile, SKILL_MD_PATH } from '../utils/skill-file.js';
import { CLAUDE_MD_CONTENT } from '../templates/claude-md-content.js';
import { SKILL_MD_CONTENT } from '../templates/skill-md-content.js';

export interface InstallOptions {
  /** When false, skip writing the whenlabs SKILL.md (Commander `--no-skill`). */
  skill?: boolean;
}

export async function install(opts: InstallOptions = {}): Promise<void> {
  console.log('\n🔧 WhenLabs toolkit installer\n');

  const mcpResult = registerMcpServer();
  console.log(mcpResult.success ? `  ✓ ${mcpResult.message}` : `  ✗ ${mcpResult.message}`);

  injectBlock(CLAUDE_MD_PATH, CLAUDE_MD_CONTENT);
  console.log(`  ✓ CLAUDE.md instructions written to ${CLAUDE_MD_PATH}`);

  if (opts.skill !== false) {
    writeSkillFile(SKILL_MD_PATH, SKILL_MD_CONTENT);
    console.log(`  ✓ Skill file written to ${SKILL_MD_PATH}`);
  } else {
    console.log('  - Skipped skill file (--no-skill)');
  }

  try {
    execFileSync('npx', ['--yes', '@whenlabs/aware', 'sync'], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout: 30_000,
    });
    console.log('  ✓ AI context files generated (aware sync)');
  } catch {
    console.log('  - Skipped aware sync (run `when init` in a project directory)');
  }

  console.log('\nInstallation complete. Run `when doctor` to verify.\n');
}
