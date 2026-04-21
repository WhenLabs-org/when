import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTool as createEnvalidTool } from '@whenlabs/envalid';
import { registerScanTool } from './register-scan-tool.js';

export function registerEnvalidTools(server: McpServer): void {
  const envalid = createEnvalidTool();

  registerScanTool(server, {
    name: 'envalid_validate',
    description: [
      'Validate a project\'s .env files against its envalid schema — catch missing required variables, type mismatches, and values outside allowed ranges.',
      '',
      'When to use: before booting the app locally, during CI, after a teammate adds a new required env var, or when switching between development and production configs. Pass `environment` to validate a specific .env.{env} file.',
      '',
      'Side effects: reads .env, .env.local, and .env.{environment} from the project root, and reads the envalid schema (typically src/env.ts or a similar file exporting `cleanEnv(...)`). Does not write or transmit env values anywhere — validation is local-only.',
      '',
      'Returns: plain-text, JSON, or markdown report listing each declared variable, whether it is present, whether its value matches the expected type, and any schema-level validation errors with file:line references. Exit 1 on any validation failure.',
    ].join('\n'),
    tool: envalid,
    formatValues: ['terminal', 'json', 'markdown'],
    extraSchema: {
      environment: z.string().optional().describe('Environment name to validate (e.g. "production", "staging", "test"). Controls which .env.{environment} file is loaded and which conditional schema rules apply. Omit to validate the default .env/.env.local pair.'),
    },
    buildOptions: ({ environment }) => ({ environment }),
  });
}
