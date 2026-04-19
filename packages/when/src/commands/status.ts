import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { hasBlock } from '../utils/claude-md.js';
import { readStatus, formatStatusLine, isStale } from '../utils/status-provider.js';

const CLAUDE_MD_PATH = join(homedir(), '.claude', 'CLAUDE.md');
const CLAUDE_JSON_PATH = join(homedir(), '.claude.json');

function isMcpRegistered(): boolean {
  // First try reading ~/.claude.json directly
  if (existsSync(CLAUDE_JSON_PATH)) {
    try {
      const raw = readFileSync(CLAUDE_JSON_PATH, 'utf-8');
      const config = JSON.parse(raw) as Record<string, unknown>;
      // Check in mcpServers at user scope
      const mcpServers = (config['mcpServers'] ?? config['mcp_servers']) as
        | Record<string, unknown>
        | undefined;
      if (mcpServers && 'velocity-mcp' in mcpServers) return true;
    } catch {
      // Fall through to CLI check
    }
  }

  // Fallback: run `claude mcp list` and grep for velocity-mcp
  try {
    const output = execSync('claude mcp list', { stdio: 'pipe', encoding: 'utf-8' });
    return output.includes('velocity-mcp');
  } catch {
    return false;
  }
}

export async function status(): Promise<void> {
  const mcpRegistered = isMcpRegistered();
  const claudeMdInstalled = hasBlock(CLAUDE_MD_PATH);

  console.log('\nWhenLabs Toolkit Status\n');
  console.log(`  MCP server (velocity-mcp): ${mcpRegistered ? '✓ registered' : '✗ not registered'}`);
  console.log(
    `  CLAUDE.md instructions:    ${claudeMdInstalled ? '✓ installed' : '✗ not installed'}`,
  );
  console.log(`  CLAUDE.md path:            ${CLAUDE_MD_PATH}`);

  // Show latest watch results if available
  const watchData = readStatus();
  if (watchData) {
    const line = formatStatusLine();
    const stale = isStale();
    const age = stale ? ' (stale)' : '';
    console.log(`\n  Watch results${age}:        ${line}`);
    console.log(`  Last scan:               ${watchData.timestamp}`);
    console.log(`  Summary:                 ${watchData.summary}`);
  }

  const allGood = mcpRegistered && claudeMdInstalled;
  if (allGood) {
    console.log('\n  Everything is set up. Run `when --help` to see available tools.\n');
  } else {
    console.log('\n  Run `when install` to complete setup.\n');
  }
}
