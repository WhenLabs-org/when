import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { registerMcpServer } from '../utils/mcp-config.js';
import { injectBlock } from '../utils/claude-md.js';

const CLAUDE_MD_PATH = join(homedir(), '.claude', 'CLAUDE.md');

const OLD_START_MARKER = '<!-- velocity-mcp:start -->';
const OLD_END_MARKER = '<!-- velocity-mcp:end -->';

const CLAUDE_MD_CONTENT = `# WhenLabs Toolkit

## Task Timing (velocity-mcp)

You have access to \`velocity-mcp\` tools. Follow these rules for EVERY session:

1. **Before starting any discrete coding task**, call \`velocity_start_task\` with:
   - Appropriate \`category\` (scaffold, implement, refactor, debug, test, config, docs, deploy)
   - Relevant \`tags\` (e.g. typescript, react, sqlite, api)
   - Clear \`description\` of what you're about to do
   - \`estimated_files\` if you know how many files you'll touch
   - \`project\` set to the current project name (auto-detected from git remote or directory name)

2. **After completing each task**, call \`velocity_end_task\` with:
   - The \`task_id\` from the start call
   - \`status\`: completed, failed, or abandoned
   - \`actual_files\`: how many files were actually modified
   - \`notes\`: any useful context about what happened

3. **When creating a multi-step plan**, call \`velocity_estimate\` to provide the user with a time estimate before starting work.

4. **If the user asks about speed or performance**, call \`velocity_stats\` to show aggregate data.

### Guidelines
- Every discrete unit of work should be tracked — don't batch multiple unrelated changes into one task
- If a task is abandoned or fails, still call \`velocity_end_task\` with the appropriate status
- Use consistent tags across sessions so the similarity matching can find comparable historical tasks
- Keep descriptions concise but specific enough to be useful for future matching

## Available CLI Tools (when)

The \`when\` CLI provides quick access to all WhenLabs tools:

- \`when stale\` — Detect documentation drift in your codebase
- \`when envalid validate\` — Validate .env files against a type-safe schema
- \`when berth\` — Detect and resolve port conflicts
- \`when aware init\` — Auto-detect your stack and generate AI context files
- \`when vow scan\` — Scan dependency licenses and validate against policies`;

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

  // 1. Register MCP server
  const mcpResult = registerMcpServer();
  console.log(mcpResult.success ? `  ✓ ${mcpResult.message}` : `  ✗ ${mcpResult.message}`);

  // 2. Inject unified CLAUDE.md block
  injectBlock(CLAUDE_MD_PATH, CLAUDE_MD_CONTENT);
  console.log(`  ✓ CLAUDE.md instructions written to ${CLAUDE_MD_PATH}`);

  // 3. Migrate old velocity-mcp standalone markers if present
  if (hasOldBlock(CLAUDE_MD_PATH)) {
    removeOldBlock(CLAUDE_MD_PATH);
    console.log('  ✓ Removed legacy velocity-mcp markers (migrated to whenlabs block)');
  }

  console.log('\nInstallation complete. Run `when status` to verify.\n');
}
