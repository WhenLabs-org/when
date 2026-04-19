import { describe, it, expect } from 'vitest';
import { EnvVarsAnalyzer } from '../../src/analyzers/static/env-vars.js';
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
      configPorts: [],
      sourceSymbols: new Set(),
      workspaces: [],
      ...codebase,
    },
    config: DEFAULT_CONFIG,
    projectPath: '/tmp/test',
  };
}

describe('EnvVarsAnalyzer', () => {
  const analyzer = new EnvVarsAnalyzer();

  it('detects documented vars not in codebase', async () => {
    const ctx = makeContext(
      [{ envVars: [{ name: 'MONGO_URI', line: 25, context: '' }] }],
      { envVarsUsed: [{ name: 'DATABASE_URL', file: 'src/db.ts', line: 3 }] },
    );

    const issues = await analyzer.analyze(ctx);
    const staleIssue = issues.find((i) => i.message.includes('MONGO_URI'));
    expect(staleIssue).toBeDefined();
    expect(staleIssue!.severity).toBe('error');
  });

  it('detects undocumented codebase vars', async () => {
    const ctx = makeContext(
      [{ envVars: [{ name: 'API_KEY', line: 10, context: '' }] }],
      { envVarsUsed: [
        { name: 'API_KEY', file: 'src/auth.ts', line: 1 },
        { name: 'SECRET_TOKEN', file: 'src/auth.ts', line: 2 },
      ] },
    );

    const issues = await analyzer.analyze(ctx);
    const undocumented = issues.find((i) => i.message.includes('SECRET_TOKEN'));
    expect(undocumented).toBeDefined();
    expect(undocumented!.severity).toBe('warning');
  });

  it('passes when all vars match', async () => {
    const ctx = makeContext(
      [{ envVars: [{ name: 'DATABASE_URL', line: 10, context: '' }] }],
      { envVarsUsed: [{ name: 'DATABASE_URL', file: 'src/db.ts', line: 3 }] },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(0);
  });

  it('does not flag platform-provided env vars as undocumented', async () => {
    const ctx = makeContext(
      [{ envVars: [] }],
      { envVarsUsed: [
        { name: 'GITHUB_TOKEN', file: 'action/index.ts', line: 11 },
        { name: 'GITHUB_WORKSPACE', file: 'action/index.ts', line: 58 },
        { name: 'HOME', file: 'src/config.ts', line: 5 },
        { name: 'REAL_APP_VAR', file: 'src/app.ts', line: 2 },
      ] },
    );
    const issues = await analyzer.analyze(ctx);
    const names = issues.map((i) => i.message);
    expect(names.some((m) => m.includes('GITHUB_TOKEN'))).toBe(false);
    expect(names.some((m) => m.includes('GITHUB_WORKSPACE'))).toBe(false);
    expect(names.some((m) => m.includes('HOME'))).toBe(false);
    expect(names.some((m) => m.includes('REAL_APP_VAR'))).toBe(true);
  });
});
