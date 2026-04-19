import { join } from 'node:path';
import { homedir } from 'node:os';
import { unregisterMcpServer } from '../utils/mcp-config.js';
import { removeBlock } from '../utils/claude-md.js';
import { uninstallForEditor, ALL_EDITORS, type EditorName } from '../utils/editor-config.js';

const CLAUDE_MD_PATH = join(homedir(), '.claude', 'CLAUDE.md');

export interface UninstallOptions {
  cursor?: boolean;
  vscode?: boolean;
  windsurf?: boolean;
  all?: boolean;
}

export async function uninstall(options: UninstallOptions = {}): Promise<void> {
  console.log('\n🗑️  WhenLabs toolkit uninstaller\n');

  const editorFlags = options.all
    ? ALL_EDITORS
    : ([
        options.cursor && 'cursor',
        options.vscode && 'vscode',
        options.windsurf && 'windsurf',
      ].filter(Boolean) as EditorName[]);

  const claudeOnly = editorFlags.length === 0;

  if (claudeOnly) {
    // 1. Remove MCP server registration (Claude Code)
    const mcpResult = unregisterMcpServer();
    console.log(mcpResult.success ? `  ✓ ${mcpResult.message}` : `  ✗ ${mcpResult.message}`);

    // 2. Remove CLAUDE.md whenlabs block
    removeBlock(CLAUDE_MD_PATH);
    console.log(`  ✓ Removed WhenLabs instructions from ${CLAUDE_MD_PATH}`);
  } else {
    for (const editor of editorFlags) {
      const result = uninstallForEditor(editor);
      console.log(result.success ? `  ✓ ${result.message}` : `  ✗ ${result.message}`);
    }
  }

  console.log('\nUninstall complete.');
  console.log('  Note: velocity task history (SQLite data) has been preserved.\n');
}
