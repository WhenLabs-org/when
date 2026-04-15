import { execSync } from 'node:child_process';

export function registerMcpServer(): { success: boolean; message: string } {
  try {
    execSync('claude mcp add -s user velocity-mcp -- npx velocity-mcp', { stdio: 'pipe' });
    return { success: true, message: 'MCP server "velocity-mcp" registered successfully.' };
  } catch (err: unknown) {
    const output =
      err instanceof Error && 'stderr' in err
        ? (err as NodeJS.ErrnoException & { stderr: Buffer }).stderr?.toString() ?? ''
        : '';
    if (output.includes('already exists') || output.includes('already registered')) {
      return { success: true, message: 'MCP server "velocity-mcp" is already registered.' };
    }
    return {
      success: false,
      message: `Failed to register MCP server: ${output || (err instanceof Error ? err.message : String(err))}`,
    };
  }
}

export function unregisterMcpServer(): { success: boolean; message: string } {
  try {
    execSync('claude mcp remove -s user velocity-mcp', { stdio: 'pipe' });
    return { success: true, message: 'MCP server "velocity-mcp" removed successfully.' };
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
      return { success: true, message: 'MCP server "velocity-mcp" was not registered.' };
    }
    return {
      success: false,
      message: `Failed to remove MCP server: ${output || (err instanceof Error ? err.message : String(err))}`,
    };
  }
}
