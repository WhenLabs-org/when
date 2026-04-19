import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseAllDocs } from '../../src/parsers/markdown.js';
import { parseCodebase } from '../../src/parsers/codebase.js';
import { getStaticAnalyzers, runAnalyzers } from '../../src/analyzers/registry.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

const FIXTURE_PATH = resolve(import.meta.dirname, '../fixtures/sample-project');

describe('Integration: full scan on sample-project', () => {
  it('detects all expected drift issues', async () => {
    const config = DEFAULT_CONFIG;
    const [docs, codebase] = await Promise.all([
      parseAllDocs(config.docs, FIXTURE_PATH),
      parseCodebase(FIXTURE_PATH, config),
    ]);

    expect(docs.length).toBeGreaterThan(0);

    const ctx = { docs, codebase, config, projectPath: FIXTURE_PATH };
    const analyzers = getStaticAnalyzers(config);
    const issues = await runAnalyzers(analyzers, ctx);

    // Should find command issues
    const cmdIssues = issues.filter((i) => i.category === 'command');
    expect(cmdIssues.length).toBeGreaterThanOrEqual(3); // build, dev, test

    // Should find file path issues
    const pathIssues = issues.filter((i) => i.category === 'file-path');
    expect(pathIssues.length).toBeGreaterThanOrEqual(1); // database.js

    // Should find env var issues
    const envIssues = issues.filter((i) => i.category === 'env-var');
    expect(envIssues.length).toBeGreaterThanOrEqual(2); // MONGO_URI, API_KEY

    // Should find version issues
    const verIssues = issues.filter((i) => i.category === 'version');
    expect(verIssues.length).toBeGreaterThanOrEqual(1); // Node 16 vs 20

    // Should find URL issues
    const urlIssues = issues.filter((i) => i.category === 'url');
    expect(urlIssues.length).toBeGreaterThanOrEqual(1); // Travis CI

    // Should find API route issues
    const apiIssues = issues.filter((i) => i.category === 'api-route');
    expect(apiIssues.length).toBeGreaterThanOrEqual(1); // DELETE /api/admin/remove

    // Should have both errors and warnings
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(errors.length).toBeGreaterThan(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('detects .js → .ts file path drift with suggestion', async () => {
    const config = DEFAULT_CONFIG;
    const [docs, codebase] = await Promise.all([
      parseAllDocs(config.docs, FIXTURE_PATH),
      parseCodebase(FIXTURE_PATH, config),
    ]);

    const ctx = { docs, codebase, config, projectPath: FIXTURE_PATH };
    const analyzers = getStaticAnalyzers(config);
    const issues = await runAnalyzers(analyzers, ctx);

    const dbPathIssue = issues.find((i) =>
      i.category === 'file-path' && i.source.text.includes('database.js'),
    );
    expect(dbPathIssue).toBeDefined();
    expect(dbPathIssue!.suggestion).toContain('database.ts');
  });
});
