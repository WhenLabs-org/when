import { execSync } from 'node:child_process';

function registerServer(name: string, command: string): { success: boolean; message: string } {
  try {
    execSync(`claude mcp add -s user ${name} -- ${command}`, { stdio: 'pipe' });
    return { success: true, message: `MCP server "${name}" registered successfully.` };
  } catch (err: unknown) {
    const output =
      err instanceof Error && 'stderr' in err
        ? (err as NodeJS.ErrnoException & { stderr: Buffer }).stderr?.toString() ?? ''
        : '';
    if (output.includes('already exists') || output.includes('already registered')) {
      return { success: true, message: `MCP server "${name}" is already registered.` };
    }
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

export function registerMcpServer(): { success: boolean; message: string } {
  // All 6 tools (including velocity) are now served by the single whenlabs MCP
  const whenlabs = registerServer('whenlabs', 'npx @whenlabs/when when-mcp');

  // Clean up legacy standalone velocity-mcp registration if present
  const legacyCleanup = unregisterServer('velocity-mcp');

  const messages = [whenlabs.message];
  if (legacyCleanup.success && !legacyCleanup.message.includes('was not registered')) {
    messages.push('Removed legacy standalone velocity-mcp (now bundled in whenlabs)');
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
