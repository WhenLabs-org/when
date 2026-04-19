import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createTool } from '../../src/tool.js';
import type { DriftReport } from '../../src/types.js';

const FIXTURE_PATH = resolve(import.meta.dirname, '../fixtures/sample-project');

describe('createTool() core contract', () => {
  it('returns a ScanResult with findings mapped from DriftReport', async () => {
    const tool = createTool();
    expect(tool.name).toBe('stale');
    expect(typeof tool.scan).toBe('function');

    const result = await tool.scan({ cwd: FIXTURE_PATH });

    expect(result.schemaVersion).toBe(1);
    expect(result.tool).toBe('stale');
    expect(result.project.cwd).toBe(FIXTURE_PATH);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.ok).toBe(result.summary.errors === 0);

    for (const f of result.findings) {
      expect(f.tool).toBe('stale');
      expect(['error', 'warning', 'info']).toContain(f.severity);
      expect(typeof f.ruleId).toBe('string');
      expect(typeof f.message).toBe('string');
    }

    expect(result.raw).toBeDefined();
    const raw = result.raw as DriftReport;
    expect(raw.issues.length).toBe(result.findings.length);
    expect(raw.docsScanned.length).toBeGreaterThan(0);
  });
});
