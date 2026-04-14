import { describe, it, expect } from 'vitest';
import { CommandsAnalyzer } from '../../src/analyzers/static/commands.js';
import type { AnalyzerContext, ParsedDocument, CodebaseFacts, StaleConfig } from '../../src/types.js';
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

describe('CommandsAnalyzer', () => {
  const analyzer = new CommandsAnalyzer();

  it('detects missing npm scripts', async () => {
    const ctx = makeContext(
      [{
        codeBlocks: [{
          language: 'bash',
          value: 'npm run build',
          line: 10,
          commands: [{ raw: 'npm run build', manager: 'npm', scriptName: 'build', line: 10 }],
        }],
      }],
      { scripts: { 'build:all': 'tsc && vite build' } },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('"build" not found');
    expect(issues[0].suggestion).toContain('build:all');
  });

  it('passes when script exists', async () => {
    const ctx = makeContext(
      [{
        codeBlocks: [{
          language: 'bash',
          value: 'npm run dev',
          line: 10,
          commands: [{ raw: 'npm run dev', manager: 'npm', scriptName: 'dev', line: 10 }],
        }],
      }],
      { scripts: { dev: 'tsx watch src/index.ts' } },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(0);
  });

  it('detects jest/vitest migration', async () => {
    const ctx = makeContext(
      [{
        codeBlocks: [{
          language: 'bash',
          value: 'npm test',
          line: 10,
          commands: [{ raw: 'npm test', manager: 'npm', scriptName: 'test', line: 10 }],
        }],
      }],
      {
        scripts: { test: 'jest' },
        devDependencies: { vitest: '^3.0.0' },
      },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('vitest');
  });

  it('detects missing make targets', async () => {
    const ctx = makeContext(
      [{
        codeBlocks: [{
          language: 'bash',
          value: 'make deploy',
          line: 5,
          commands: [{ raw: 'make deploy', manager: 'make', scriptName: 'deploy', line: 5 }],
        }],
      }],
      { makeTargets: ['build', 'test', 'lint'] },
    );

    const issues = await analyzer.analyze(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('deploy');
  });
});
