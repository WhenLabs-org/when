import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTool as createVowTool } from '@whenlabs/vow';
import { registerScanTool } from './register-scan-tool.js';

export function registerVowTools(server: McpServer): void {
  const vow = createVowTool();

  registerScanTool(server, {
    name: 'vow_scan',
    description: 'Scan dependency licenses and validate against policy — summarize licenses and flag violations',
    tool: vow,
    extraSchema: {
      production: z.coerce.boolean().optional().describe('Skip devDependencies'),
    },
    buildOptions: ({ production, format }) => ({ production, format }),
  });
}
