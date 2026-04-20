import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function registerServer(name: string, command: string): { success: boolean; message: string } {
  // Remove first to ensure we always update to the latest command
  try {
    execSync(`claude mcp remove -s user ${name}`, { stdio: 'pipe' });
  } catch {
    // Ignore — may not exist yet
  }

  try {
    execSync(`claude mcp add -s user ${name} -- ${command}`, { stdio: 'pipe' });
    return { success: true, message: `MCP server "${name}" registered.` };
  } catch (err: unknown) {
    const output =
      err instanceof Error && 'stderr' in err
        ? (err as NodeJS.ErrnoException & { stderr: Buffer }).stderr?.toString() ?? ''
        : '';
    return {
      success: false,
      message: `Failed to register "${name}": ${output || (err instanceof Error ? err.message : String(err))}`,
    };
  }
}

function unregisterServer(name: string): { success: boolean; message: string } {
  try {
    execSync(`claude mcp remove -s user ${name}`, { stdio: 'pipe' });
    return { success: true, message: `MCP server "${name}" removed.` };
  } catch (err: unknown) {
    const output =
      err instanceof Error && 'stderr' in err
        ? (err as NodeJS.ErrnoException & { stderr: Buffer }).stderr?.toString() ?? ''
        : '';
    if (
      output.includes('not found') ||
      output.includes('not registered') ||
      output.includes('does not exist')
    ) {
      return { success: true, message: `MCP server "${name}" was not registered.` };
    }
    return {
      success: false,
      message: `Failed to remove "${name}": ${output || (err instanceof Error ? err.message : String(err))}`,
    };
  }
}

function cleanLegacyMcpJson(): string | null {
  // Walk up from cwd looking for .mcp.json files with velocity-mcp entries
  let dir = process.cwd();
  const root = resolve('/');
  while (dir !== root) {
    const mcpJson = resolve(dir, '.mcp.json');
    if (existsSync(mcpJson)) {
      try {
        const data = JSON.parse(readFileSync(mcpJson, 'utf-8'));
        if (data?.mcpServers?.['velocity-mcp']) {
          delete data.mcpServers['velocity-mcp'];
          writeFileSync(mcpJson, JSON.stringify(data, null, 2) + '\n', 'utf-8');
          return mcpJson;
        }
      } catch {
        // Skip malformed files
      }
    }
    dir = resolve(dir, '..');
  }
  return null;
}

// `@whenlabs/when` ships two bins (`when` and `when-mcp`). `npx <pkg> <bin>`
// always runs the default bin and treats the rest as args — `npx @whenlabs/when
// when-mcp` fails with "unknown command 'when-mcp'". The `-p <pkg>` form
// installs the package but lets `<bin>` pick the non-default entry. `@latest`
// guards against a stale cached version overriding the intended one.
export const MCP_SERVER_COMMAND = 'npx -y -p @whenlabs/when@latest when-mcp';

export function registerMcpServer(): { success: boolean; message: string } {
  // All 6 tools (including velocity) are now served by the single whenlabs MCP
  const whenlabs = registerServer('whenlabs', MCP_SERVER_COMMAND);

  // Clean up legacy standalone velocity-mcp from user scope
  const legacyCleanup = unregisterServer('velocity-mcp');

  // Also clean up velocity-mcp from any .mcp.json files
  const cleanedFile = cleanLegacyMcpJson();

  const messages = [whenlabs.message];
  if (legacyCleanup.success && !legacyCleanup.message.includes('was not registered')) {
    messages.push('Removed legacy velocity-mcp from user config (now bundled in whenlabs)');
  }
  if (cleanedFile) {
    messages.push(`Removed legacy velocity-mcp from ${cleanedFile}`);
  }

  return {
    success: whenlabs.success,
    message: messages.join('\n  '),
  };
}

export function unregisterMcpServer(): { success: boolean; message: string } {
  const whenlabs = unregisterServer('whenlabs');
  // Also clean up legacy velocity-mcp if it exists
  const velocity = unregisterServer('velocity-mcp');
  const messages = [whenlabs.message];
  if (velocity.success && !velocity.message.includes('was not registered')) {
    messages.push(velocity.message);
  }
  return {
    success: whenlabs.success,
    message: messages.join('\n  '),
  };
}
