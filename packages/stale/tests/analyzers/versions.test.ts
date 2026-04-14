import { describe, it, expect } from 'vitest';
import { VersionsAnalyzer } from '../../src/analyzers/static/versions.js';
import type { AnalyzerContext, ParsedDocument, CodebaseFacts } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

function makeContext(
  docs: Partial<ParsedDocument>[],
  codebase: Partial<CodebaseFacts>,
): AnalyzerContext {
  return {
    docs: docs.map((d) => ({
      filePath: 'README.md',
      codeBlocks: [],
      inlineCode: [],
      links: [],
      filePaths: [],
      envVars: [],
      versionClaims: [],
      dependencyClaims: [],
      apiEndpoints: [],
      sections: [],
      ...d,
    })),
    codebase: {
      scripts: {},
      makeTargets: [],
      envVarsUsed: [],
      routes: [],
      existingFiles: new Set(),
      dependencies: {},
      devDependencies: {},
      ...codebase,
    },
    config: DEFAULT_CONFIG,
    projectPath: '/tmp/test',
  };
}

describe('VersionsAnalyzer', () => {
  const analyzer = new VersionsAnalyzer();

  it('detects outdated Node version claim', async () => {
    const ctx = makeContext(
      [{ versionClaims: [{ runtime: 'node', version: '16', line: 9, rawText: 'Node.js 16 or higher' }] }],
      { nodeVersion: { fromEngines: '>=20.0.0' } },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('16');
    expect(issues[0].message).toContain('20');
  });

  it('passes when version matches', async () => {
    const ctx = makeContext(
      [{ versionClaims: [{ runtime: 'node', version: '20', line: 9, rawText: 'Node.js 20 or higher' }] }],
      { nodeVersion: { fromEngines: '>=20.0.0' } },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(0);
  });

  it('handles missing version info gracefully', async () => {
    const ctx = makeContext(
      [{ versionClaims: [{ runtime: 'node', version: '16', line: 9, rawText: 'Node.js 16' }] }],
      {},
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(0);
  });
});
