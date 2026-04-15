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
  const velocity = registerServer('velocity-mcp', 'npx @whenlabs/velocity-mcp');
  const whenlabs = registerServer('whenlabs', 'npx @whenlabs/when when-mcp');
  return {
    success: velocity.success && whenlabs.success,
    message: [velocity.message, whenlabs.message].join('\n  '),
  };
}

export function unregisterMcpServer(): { success: boolean; message: string } {
  const velocity = unregisterServer('velocity-mcp');
  const whenlabs = unregisterServer('whenlabs');
  return {
    success: velocity.success && whenlabs.success,
    message: [velocity.message, whenlabs.message].join('\n  '),
  };
}
