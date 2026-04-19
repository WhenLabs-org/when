import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerMcpServer } from '../utils/mcp-config.js';
import { injectBlock } from '../utils/claude-md.js';
import { installForEditor, ALL_EDITORS, type EditorName } from '../utils/editor-config.js';
import { CLAUDE_MD_CONTENT } from '../templates/claude-md-content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLAUDE_MD_PATH = join(homedir(), '.claude', 'CLAUDE.md');
const SCRIPTS_DIR = join(homedir(), '.claude', 'scripts');
const STATUSLINE_PATH = join(SCRIPTS_DIR, 'statusline.py');
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

const OLD_START_MARKER = '<!-- velocity-mcp:start -->';
const OLD_END_MARKER = '<!-- velocity-mcp:end -->';

const STATUSLINE_SCRIPT = readFileSync(
  resolve(__dirname, '..', 'templates', 'statusline.py'),
  'utf-8',
);

function installStatusLine(): { installed: boolean; message: string } {
  try {
    mkdirSync(SCRIPTS_DIR, { recursive: true });
    writeFileSync(STATUSLINE_PATH, STATUSLINE_SCRIPT, 'utf-8');
    chmodSync(STATUSLINE_PATH, 0o755);

    // Configure Claude Code settings to use the status line
    let settings: Record<string, unknown> = {};
    if (existsSync(SETTINGS_PATH)) {
      try {
        settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
      } catch {
        settings = {};
      }
    }

    const statuslineCmd = `python3 ${STATUSLINE_PATH}`;
    const currentCmd = (settings as any).statusLine?.command;
    if (currentCmd !== statuslineCmd) {
      (settings as any).statusLine = { type: 'command', command: statuslineCmd };
      writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    }

    return { installed: true, message: 'Status line installed (proactive background scans)' };
  } catch (err: any) {
    return { installed: false, message: `Status line install failed: ${err.message}` };
  }
}

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

export interface InstallOptions {
  cursor?: boolean;
  vscode?: boolean;
  windsurf?: boolean;
  all?: boolean;
}

export async function install(options: InstallOptions = {}): Promise<void> {
  console.log('\n🔧 WhenLabs toolkit installer\n');

  const editorFlags = options.all
    ? ALL_EDITORS
    : ([
        options.cursor && 'cursor',
        options.vscode && 'vscode',
        options.windsurf && 'windsurf',
      ].filter(Boolean) as EditorName[]);

  const claudeOnly = editorFlags.length === 0;

  if (claudeOnly) {
    // 1. Register unified MCP server (all 6 tools in one)
    const mcpResult = registerMcpServer();
    console.log(mcpResult.success ? `  ✓ ${mcpResult.message}` : `  ✗ ${mcpResult.message}`);

    // 2. Inject unified CLAUDE.md block
    injectBlock(CLAUDE_MD_PATH, CLAUDE_MD_CONTENT);
    console.log(`  ✓ CLAUDE.md instructions written to ${CLAUDE_MD_PATH}`);

    // 3. Install status line script (proactive background scans)
    const slResult = installStatusLine();
    console.log(slResult.installed ? `  ✓ ${slResult.message}` : `  ✗ ${slResult.message}`);

    // 4. Run aware init + sync to generate up-to-date AI context files
    try {
      const cwd = process.cwd();
      execFileSync('npx', ['--yes', '@whenlabs/aware', 'init', '--force'], {
        cwd,
        stdio: 'pipe',
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
        timeout: 30_000,
      });
      execFileSync('npx', ['--yes', '@whenlabs/aware', 'sync'], {
        cwd,
        stdio: 'pipe',
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
        timeout: 30_000,
      });
      console.log('  ✓ AI context files generated and synced (aware init + sync)');
    } catch {
      console.log('  - Skipped aware init (run `when aware init` in a project directory)');
    }

    // 5. Migrate old velocity-mcp standalone markers if present
    if (hasOldBlock(CLAUDE_MD_PATH)) {
      removeOldBlock(CLAUDE_MD_PATH);
      console.log('  ✓ Removed legacy velocity-mcp markers (migrated to whenlabs block)');
    }
  } else {
    for (const editor of editorFlags) {
      const result = installForEditor(editor);
      console.log(result.success ? `  ✓ ${result.message}` : `  ✗ ${result.message}`);
    }
  }

  console.log('\nInstallation complete. Run `when status` to verify.\n');
}
