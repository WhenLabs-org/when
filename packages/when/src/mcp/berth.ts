import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createTool as createBerthTool } from '@whenlabs/berth';
import { registerScanTool } from './register-scan-tool.js';

export function registerBerthTools(server: McpServer): void {
  const berth = createBerthTool();

  registerScanTool(server, {
    name: 'berth_check',
    description: 'Scan a project directory for port conflicts before starting dev servers',
    tool: berth,
  });
}
