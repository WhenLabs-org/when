import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTool as createEnvalidTool } from '@whenlabs/envalid';
import { registerScanTool } from './register-scan-tool.js';

export function registerEnvalidTools(server: McpServer): void {
  const envalid = createEnvalidTool();

  registerScanTool(server, {
    name: 'envalid_validate',
    description: 'Validate .env files against their schema — catch missing or invalid environment variables',
    tool: envalid,
    formatValues: ['terminal', 'json', 'markdown'],
    extraSchema: {
      environment: z.string().optional().describe('Target environment (e.g. production, staging)'),
    },
    buildOptions: ({ environment }) => ({ environment }),
  });
}
