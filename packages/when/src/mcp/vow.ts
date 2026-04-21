import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createTool as createVowTool } from '@whenlabs/vow';
import { registerScanTool } from './register-scan-tool.js';

export function registerVowTools(server: McpServer): void {
  const vow = createVowTool();

  registerScanTool(server, {
    name: 'vow_scan',
    description: [
      'Scan all dependency licenses in a project and — if a policy file is present — validate each package against that policy, flagging disallowed licenses (e.g. GPL in a proprietary codebase) or packages with unknown licenses.',
      '',
      'When to use: before shipping a release, when adding a new dependency, during compliance or legal review, or as a CI gate. Set `production: true` to skip devDependencies and audit only what actually ships.',
      '',
      'Side effects: reads supported lockfiles (package-lock.json or npm-shrinkwrap.json for Node; Cargo.lock for Rust; requirements.txt with hashes, uv.lock, or poetry.lock for Python) plus local node_modules / vendor manifests to resolve license strings. Pnpm, yarn, and go are not yet supported — vow exits with a clear error when only those lockfiles are present. Read-only; no network requests.',
      '',
      'Returns: plain-text, JSON, or markdown summary of package → license mapping grouped by license family (MIT/Apache/BSD/GPL/unknown), with per-package links. Exit 1 if any dependency violates the policy or has an unknown license, 0 otherwise.',
    ].join('\n'),
    tool: vow,
    extraSchema: {
      production: z.coerce.boolean().optional().describe('When true, exclude devDependencies from the scan and audit only runtime dependencies that ship with the published package. Use this for release-gate checks; leave false for full audits.'),
    },
    buildOptions: ({ production, format }) => ({ production, format }),
  });
}
