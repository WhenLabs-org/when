import { unregisterMcpServer } from '../utils/mcp-config.js';
import { removeBlock, CLAUDE_MD_PATH } from '../utils/claude-md.js';
import { removeSkillFile, SKILL_MD_PATH } from '../utils/skill-file.js';
import { removeWhenlabsHook, SETTINGS_PATH } from '../utils/settings-hook.js';

export async function uninstall(): Promise<void> {
  console.log('\n🗑️  WhenLabs toolkit uninstaller\n');

  const mcpResult = unregisterMcpServer();
  console.log(mcpResult.success ? `  ✓ ${mcpResult.message}` : `  ✗ ${mcpResult.message}`);

  removeBlock(CLAUDE_MD_PATH);
  console.log(`  ✓ Removed WhenLabs instructions from ${CLAUDE_MD_PATH}`);

  removeSkillFile(SKILL_MD_PATH);
  console.log(`  ✓ Removed skill file at ${SKILL_MD_PATH}`);

  // Always attempt hook removal: a no-op when nothing was installed, but
  // avoids leaving orphan entries if the user ever ran `install --hooks`.
  removeWhenlabsHook();
  console.log(`  ✓ Removed UserPromptSubmit hook (if present) from ${SETTINGS_PATH}`);

  console.log('\nUninstall complete.');
  console.log('  Note: task history is preserved.\n');
}
