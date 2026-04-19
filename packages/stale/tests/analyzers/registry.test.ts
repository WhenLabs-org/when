import { describe, it, expect, vi } from 'vitest';
import { runAnalyzers } from '../../src/analyzers/registry.js';
import type { Analyzer, AnalyzerContext } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

function makeCtx(): AnalyzerContext {
  return {
    docs: [],
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
    },
    config: DEFAULT_CONFIG,
    projectPath: '/tmp',
  };
}

describe('runAnalyzers', () => {
  it('collects issues from all analyzers', async () => {
    const a: Analyzer = {
      name: 'a',
      category: 'command',
      analyze: async () => [{
        id: 'a:1', category: 'command', severity: 'error',
        source: { file: 'x.md', line: 1, text: '' }, message: 'a',
      }],
    };
    const b: Analyzer = {
      name: 'b',
      category: 'file-path',
      analyze: async () => [{
        id: 'b:1', category: 'file-path', severity: 'warning',
        source: { file: 'x.md', line: 2, text: '' }, message: 'b',
      }],
    };
    const issues = await runAnalyzers([a, b], makeCtx());
    expect(issues).toHaveLength(2);
  });

  it('survives a crashing analyzer and returns the rest', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad: Analyzer = {
      name: 'bad',
      category: 'command',
      analyze: async () => { throw new Error('boom'); },
    };
    const good: Analyzer = {
      name: 'good',
      category: 'file-path',
      analyze: async () => [{
        id: 'g:1', category: 'file-path', severity: 'warning',
        source: { file: 'x.md', line: 1, text: '' }, message: 'ok',
      }],
    };
    const issues = await runAnalyzers([bad, good], makeCtx());
    expect(issues).toHaveLength(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('enforces a per-analyzer timeout', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const slow: Analyzer = {
      name: 'slow',
      category: 'command',
      analyze: () => new Promise(() => {}),
    };
    const fast: Analyzer = {
      name: 'fast',
      category: 'file-path',
      analyze: async () => [],
    };
    const issues = await runAnalyzers([slow, fast], makeCtx(), { timeoutMs: 25 });
    expect(issues).toHaveLength(0);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    errSpy.mockRestore();
  });
});
