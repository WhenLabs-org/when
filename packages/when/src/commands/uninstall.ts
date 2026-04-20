import { unregisterMcpServer } from '../utils/mcp-config.js';
import { removeBlock, CLAUDE_MD_PATH } from '../utils/claude-md.js';

export async function uninstall(): Promise<void> {
  console.log('\n🗑️  WhenLabs toolkit uninstaller\n');

  const mcpResult = unregisterMcpServer();
  console.log(mcpResult.success ? `  ✓ ${mcpResult.message}` : `  ✗ ${mcpResult.message}`);

  removeBlock(CLAUDE_MD_PATH);
  console.log(`  ✓ Removed WhenLabs instructions from ${CLAUDE_MD_PATH}`);

  console.log('\nUninstall complete.');
  console.log('  Note: task history is preserved.\n');
}
