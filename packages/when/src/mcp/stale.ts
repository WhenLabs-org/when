import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTool as createStaleTool } from '@whenlabs/stale';
import { registerScanTool } from './register-scan-tool.js';

export function registerStaleTools(server: McpServer): void {
  const stale = createStaleTool();

  registerScanTool(server, {
    name: 'stale_scan',
    description: 'Scan for documentation drift — detect when docs say one thing and code says another',
    tool: stale,
    cacheName: 'stale',
    formatValues: ['terminal', 'json', 'markdown'],
    extraSchema: {
      git: z.coerce.boolean().optional().describe('Enable git history staleness checks'),
    },
    buildOptions: ({ git }) => ({ git }),
  });
}
