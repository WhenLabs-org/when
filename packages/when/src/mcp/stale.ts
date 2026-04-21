import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTool as createStaleTool } from '@whenlabs/stale';
import { registerScanTool } from './register-scan-tool.js';

export function registerStaleTools(server: McpServer): void {
  const stale = createStaleTool();

  registerScanTool(server, {
    name: 'stale_scan',
    description: [
      'Detect documentation drift — find places in README.md, CHANGELOG.md, and other project markdown where the docs reference commands, flags, APIs, or files that the code no longer matches.',
      '',
      'When to use: before tagging a release, after large refactors or renames, when onboarding a new contributor, or as a periodic health check. Set `git: true` to additionally flag docs that have not been touched since a closely related source file changed significantly.',
      '',
      'Side effects: reads all markdown files and source files reachable from the project root (respecting .gitignore). Never writes, auto-fixes, or moves files — this is a pure reporting tool.',
      '',
      'Returns: plain-text, JSON, or markdown report listing each drifted section with file:line references and a one-line explanation of the mismatch (e.g. "README references --deep flag removed in src/cli.ts:42"). Exit 1 if any drift is found.',
    ].join('\n'),
    tool: stale,
    cacheName: 'stale',
    formatValues: ['terminal', 'json', 'markdown'],
    extraSchema: {
      git: z.coerce.boolean().optional().describe('When true, additionally compare each markdown file\'s last-modified commit against the closest-related source file and flag docs that are significantly older. Requires the project to be a git repository; silently skipped otherwise.'),
    },
    buildOptions: ({ git }) => ({ git }),
  });
}
