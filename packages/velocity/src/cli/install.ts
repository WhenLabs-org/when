import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { installHooks, claudeSettingsPath } from './hooks-settings.js';

export interface InstallOptions {
  noHooks?: boolean;
}

const CLAUDE_MD_MARKER = '<!-- velocity-mcp:start -->';
const CLAUDE_MD_MARKER_END = '<!-- velocity-mcp:end -->';

const TASK_TIMING_INSTRUCTIONS = `${CLAUDE_MD_MARKER}
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
${CLAUDE_MD_MARKER_END}`;

export async function install(options: InstallOptions = {}): Promise<void> {
  console.log('\n⚡ velocity-mcp installer\n');

  // Step 1: Add MCP server globally via claude CLI
  console.log('1. Adding velocity-mcp as a global MCP server...');
  try {
    execSync('claude mcp add -s user velocity-mcp -- npx velocity-mcp', {
      stdio: 'pipe',
    });
    console.log('   ✓ MCP server registered (user scope)');
  } catch (error: unknown) {
    const stderr = (error as { stderr?: Buffer })?.stderr?.toString() ?? '';
    if (stderr.includes('already exists')) {
      console.log('   ✓ MCP server already registered');
    } else {
      console.error('   ✗ Failed to register MCP server. Is Claude Code installed?');
      console.error(`     Run manually: claude mcp add -s user velocity-mcp -- npx velocity-mcp`);
      if (stderr) console.error(`     Error: ${stderr.trim()}`);
    }
  }

  // Step 2: Append task timing instructions to ~/.claude/CLAUDE.md
  console.log('2. Adding task timing instructions to ~/.claude/CLAUDE.md...');
  const claudeDir = join(homedir(), '.claude');
  const claudeMdPath = join(claudeDir, 'CLAUDE.md');

  mkdirSync(claudeDir, { recursive: true });

  let existing = '';
  if (existsSync(claudeMdPath)) {
    existing = readFileSync(claudeMdPath, 'utf-8');
  }

  if (existing.includes(CLAUDE_MD_MARKER)) {
    // Replace existing velocity-mcp block
    const regex = new RegExp(
      `${escapeRegex(CLAUDE_MD_MARKER)}[\\s\\S]*?${escapeRegex(CLAUDE_MD_MARKER_END)}`,
    );
    const updated = existing.replace(regex, TASK_TIMING_INSTRUCTIONS);
    writeFileSync(claudeMdPath, updated, 'utf-8');
    console.log('   ✓ Updated existing velocity-mcp instructions');
  } else {
    // Append to end
    const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n\n' : existing.length > 0 ? '\n' : '';
    writeFileSync(claudeMdPath, existing + separator + TASK_TIMING_INSTRUCTIONS + '\n', 'utf-8');
    console.log('   ✓ Added velocity-mcp instructions');
  }

  // Step 3: Install auto-instrumentation hooks in ~/.claude/settings.json
  if (options.noHooks) {
    console.log('3. Skipping hook installation (--no-hooks)');
  } else {
    console.log('3. Installing auto-instrumentation hooks in ~/.claude/settings.json...');
    try {
      installHooks();
      console.log(`   ✓ Hooks installed at ${claudeSettingsPath()}`);
      console.log('     (edits, test runs, and session end are now tracked automatically)');
    } catch (err) {
      console.error(`   ✗ Failed to install hooks: ${(err as Error).message}`);
      console.error('     You can retry with: npx velocity-mcp install');
    }
  }

  console.log('\n✅ Installation complete!\n');
  console.log('Every new Claude Code session will now automatically track task velocity.');
  console.log('Your velocity data is stored at: ~/.velocity-mcp/velocity.db');
  console.log('\nTo uninstall: npx velocity-mcp uninstall\n');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
