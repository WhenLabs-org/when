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

## WhenLabs MCP Tools (ALWAYS prefer these over shell commands)

You have access to the \`whenlabs\` MCP server. **ALWAYS use these MCP tools instead of running shell commands like lsof, grep, or manual checks.** These tools are purpose-built and give better results:

| When to use | Call this tool | NOT this |
|-------------|---------------|----------|
| Check ports or port conflicts | \`berth_status\` or \`berth_check\` | \`lsof\`, \`netstat\`, \`ss\` |
| Scan dependency licenses | \`vow_scan\` or \`vow_check\` | manual \`npm ls\`, \`license-checker\` |
| Check if docs are stale | \`stale_scan\` | manual file comparison |
| Validate .env files | \`envalid_validate\` or \`envalid_detect\` | manual .env inspection |
| Generate AI context files | \`aware_init\` or \`aware_doctor\` | manual CLAUDE.md creation |

### Tool Reference
- \`berth_status\` — Show all active ports, Docker ports, and configured ports
- \`berth_check\` — Scan a project directory for port conflicts
- \`stale_scan\` — Detect documentation drift in the codebase
- \`envalid_validate\` — Validate .env files against their schema
- \`envalid_detect\` — Find undocumented env vars in codebase
- \`aware_init\` — Auto-detect stack and generate AI context files
- \`aware_doctor\` — Diagnose project health and config issues
- \`vow_scan\` — Scan and summarize all dependency licenses
- \`vow_check\` — Validate licenses against a policy file

### Proactive Background Scans
WhenLabs tools run automatically in the background on a schedule. The status line shows findings:
- \`stale:N\` — N docs have drifted from code. Run \`stale_scan\` and fix the drift.
- \`env:N\` — N .env issues found. Run \`envalid_validate\` and help the user fix them.
- \`ports:N\` — N port conflicts. Run \`berth_status\` and suggest resolution.
- \`lic:N?\` — N packages with unknown licenses. Run \`vow_scan\` for details.
- \`aware:stale\` — AI context files are outdated. Run \`aware_init\` to regenerate.

**When you see any of these in the status line, proactively tell the user and offer to fix the issue.** Do not wait for the user to ask.`;

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
