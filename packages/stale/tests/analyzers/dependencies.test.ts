import { describe, it, expect } from 'vitest';
import { DependenciesAnalyzer } from '../../src/analyzers/static/dependencies.js';
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
      portClaims: [],
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
      configPorts: [],
      sourceSymbols: new Set(),
      workspaces: [],
      ...codebase,
    },
    config: DEFAULT_CONFIG,
    projectPath: '/tmp/test',
  };
}

describe('DependenciesAnalyzer', () => {
  const analyzer = new DependenciesAnalyzer();

  it('flags a claim that is not in root deps', async () => {
    const ctx = makeContext(
      [{
        filePath: 'README.md',
        dependencyClaims: [{ name: 'Redis', line: 3, context: 'requires redis' }],
      }],
      { dependencies: { express: '^4.0.0' } },
    );
    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('Redis');
  });

  it('passes when a workspace package.json includes the dep even if root does not', async () => {
    const ctx = makeContext(
      [{
        filePath: 'packages/api/README.md',
        dependencyClaims: [{ name: 'Redis', line: 3, context: 'requires redis' }],
      }],
      {
        dependencies: {},
        workspaces: [{
          name: '@org/api',
          relativePath: 'packages/api',
          scripts: {},
          dependencies: { ioredis: '^5.0.0' },
          devDependencies: {},
        }],
      },
    );
    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(0);
  });

  it('still flags a claim when a different workspace has the dep', async () => {
    const ctx = makeContext(
      [{
        filePath: 'packages/web/README.md',
        dependencyClaims: [{ name: 'Redis', line: 3, context: 'requires redis' }],
      }],
      {
        dependencies: {},
        workspaces: [
          { name: '@org/api', relativePath: 'packages/api', scripts: {}, dependencies: { ioredis: '^5.0.0' }, devDependencies: {} },
          { name: '@org/web', relativePath: 'packages/web', scripts: {}, dependencies: {}, devDependencies: {} },
        ],
      },
    );
    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(1);
  });
});
