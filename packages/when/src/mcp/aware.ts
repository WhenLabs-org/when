import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatOutput, writeCache } from './run-cli.js';
import { detectProjectDirName } from '../utils/detect-project.js';

export function registerAwareTools(server: McpServer): void {
  server.tool(
    'aware_sync',
    [
      'Detect the project\'s tech stack and regenerate AI context files (CLAUDE.md, .cursorrules, .windsurfrules, AGENT.md) from the project\'s .aware.json config.',
      '',
      'When to use: after adding or removing a framework/language, when AI context files fall out of date, or when onboarding a new agent to the repo. Do not call on every turn — run once per session or after stack changes.',
      '',
      'Side effects: reads package.json, requirements.txt, pyproject.toml, go.mod, Cargo.toml, and similar manifest files to detect the stack. Writes or overwrites CLAUDE.md, .cursorrules, .windsurfrules, and AGENT.md in the project root based on .aware.json templates. Never modifies source code.',
      '',
      'Returns: plain-text summary listing the detected stack, the files written (or that would be written, in dry-run mode), and any errors. Exit 0 on success, non-zero on failure.',
    ].join('\n'),
    {
      path: z.string().optional().describe('Absolute or relative path to the project root. Defaults to the current working directory.'),
      dryRun: z.coerce.boolean().optional().describe('When true, report the files that would be written without touching disk. Use this to preview changes before committing.'),
    },
    async ({ path, dryRun }) => {
      const args = ['sync'];
      if (dryRun) args.push('--dry-run');
      const result = await runCli('aware', args, path);
      const output = formatOutput(result);
      writeCache('aware_sync', detectProjectDirName(path), output, result.exitCode);
      return { content: [{ type: 'text' as const, text: output }] };
    },
  );
}
