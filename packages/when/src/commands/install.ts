import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { registerMcpServer } from '../utils/mcp-config.js';
import { injectBlock } from '../utils/claude-md.js';
import { CLAUDE_MD_CONTENT } from '../templates/claude-md-content.js';

const CLAUDE_MD_PATH = join(homedir(), '.claude', 'CLAUDE.md');

const OLD_START_MARKER = '<!-- velocity-mcp:start -->';
const OLD_END_MARKER = '<!-- velocity-mcp:end -->';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasOldBlock(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  return content.includes(OLD_START_MARKER) && content.includes(OLD_END_MARKER);
}

function removeOldBlock(filePath: string): void {
  if (!existsSync(filePath)) return;
  let content = readFileSync(filePath, 'utf-8');
  const pattern = new RegExp(
    `\\n?${escapeRegex(OLD_START_MARKER)}[\\s\\S]*?${escapeRegex(OLD_END_MARKER)}\\n?`,
    'g',
  );
  content = content.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  writeFileSync(filePath, content, 'utf-8');
}

export async function install(): Promise<void> {
  console.log('\n🔧 WhenLabs toolkit installer\n');

  const mcpResult = registerMcpServer();
  console.log(mcpResult.success ? `  ✓ ${mcpResult.message}` : `  ✗ ${mcpResult.message}`);

  injectBlock(CLAUDE_MD_PATH, CLAUDE_MD_CONTENT);
  console.log(`  ✓ CLAUDE.md instructions written to ${CLAUDE_MD_PATH}`);

  try {
    const cwd = process.cwd();
    execFileSync('npx', ['--yes', '@whenlabs/aware', 'sync'], {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout: 30_000,
    });
    console.log('  ✓ AI context files generated (aware sync)');
  } catch {
    console.log('  - Skipped aware sync (run `when init` in a project directory)');
  }

  if (hasOldBlock(CLAUDE_MD_PATH)) {
    removeOldBlock(CLAUDE_MD_PATH);
    console.log('  ✓ Removed legacy velocity-mcp markers (migrated to whenlabs block)');
  }

  console.log('\nInstallation complete. Run `when doctor` to verify.\n');
}
