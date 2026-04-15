import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CLAUDE_MD_MARKER = '<!-- velocity-mcp:start -->';
const CLAUDE_MD_MARKER_END = '<!-- velocity-mcp:end -->';

export async function uninstall(): Promise<void> {
  console.log('\n⚡ velocity-mcp uninstaller\n');

  // Step 1: Remove MCP server globally
  console.log('1. Removing velocity-mcp from global MCP servers...');
  try {
    execSync('claude mcp remove -s user velocity-mcp', { stdio: 'pipe' });
    console.log('   ✓ MCP server removed');
  } catch {
    console.log('   ✓ MCP server was not registered (nothing to remove)');
  }

  // Step 2: Remove task timing instructions from ~/.claude/CLAUDE.md
  console.log('2. Removing task timing instructions from ~/.claude/CLAUDE.md...');
  const claudeMdPath = join(homedir(), '.claude', 'CLAUDE.md');

  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    if (content.includes(CLAUDE_MD_MARKER)) {
      const regex = new RegExp(
        `\\n?${escapeRegex(CLAUDE_MD_MARKER)}[\\s\\S]*?${escapeRegex(CLAUDE_MD_MARKER_END)}\\n?`,
      );
      const updated = content.replace(regex, '\n').replace(/\n{3,}/g, '\n\n').trim();
      writeFileSync(claudeMdPath, updated.length > 0 ? updated + '\n' : '', 'utf-8');
      console.log('   ✓ Removed velocity-mcp instructions');
    } else {
      console.log('   ✓ No velocity-mcp instructions found (nothing to remove)');
    }
  } else {
    console.log('   ✓ No ~/.claude/CLAUDE.md found (nothing to remove)');
  }

  console.log('\n✅ Uninstall complete!\n');
  console.log('Your velocity data is still at: ~/.velocity-mcp/velocity.db');
  console.log('To delete it: rm -rf ~/.velocity-mcp\n');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
