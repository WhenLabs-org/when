import { join } from 'node:path';
import { homedir } from 'node:os';
import { unregisterMcpServer } from '../utils/mcp-config.js';
import { removeBlock } from '../utils/claude-md.js';

const CLAUDE_MD_PATH = join(homedir(), '.claude', 'CLAUDE.md');

export async function uninstall(): Promise<void> {
  console.log('\n🗑️  WhenLabs toolkit uninstaller\n');

  const mcpResult = unregisterMcpServer();
  console.log(mcpResult.success ? `  ✓ ${mcpResult.message}` : `  ✗ ${mcpResult.message}`);

  removeBlock(CLAUDE_MD_PATH);
  console.log(`  ✓ Removed WhenLabs instructions from ${CLAUDE_MD_PATH}`);

  console.log('\nUninstall complete.');
  console.log('  Note: velocity task history (SQLite data) has been preserved.\n');
}
