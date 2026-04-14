import { describe, it, expect } from 'vitest';
import { FilePathsAnalyzer } from '../../src/analyzers/static/file-paths.js';
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

describe('FilePathsAnalyzer', () => {
  const analyzer = new FilePathsAnalyzer();

  it('detects missing files', async () => {
    const ctx = makeContext(
      [{ filePaths: [{ path: 'src/config/database.js', line: 30, context: '' }] }],
      { existingFiles: new Set(['src/config/database.ts', 'src/index.ts']) },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].suggestion).toContain('database.ts');
  });

  it('passes when file exists', async () => {
    const ctx = makeContext(
      [{ filePaths: [{ path: 'src/index.ts', line: 10, context: '' }] }],
      { existingFiles: new Set(['src/index.ts']) },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(0);
  });

  it('suggests .yaml for .yml', async () => {
    const ctx = makeContext(
      [{ filePaths: [{ path: 'docker-compose.yml', line: 5, context: '' }] }],
      { existingFiles: new Set(['docker-compose.yaml']) },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].suggestion).toContain('docker-compose.yaml');
  });
});
