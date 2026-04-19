import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createTool } from '../../src/tool.js';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'npm');

describe('createTool (core contract)', () => {
  it('returns a Tool with correct shape', () => {
    const tool = createTool();
    expect(tool.name).toBe('vow');
    expect(typeof tool.description).toBe('string');
    expect(typeof tool.scan).toBe('function');
  });

  it('scan() returns a ScanResult matching @whenlabs/core contract', async () => {
    const tool = createTool();
    const result = await tool.scan({ cwd: path.join(FIXTURES, 'simple') });

    expect(result.schemaVersion).toBe(1);
    expect(result.tool).toBe('vow');
    expect(typeof result.ok).toBe('boolean');
    expect(result.project).toMatchObject({
      name: expect.any(String),
      cwd: expect.any(String),
      detectedStack: expect.any(Array),
    });
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.summary).toMatchObject({
      total: expect.any(Number),
      errors: expect.any(Number),
      warnings: expect.any(Number),
      infos: expect.any(Number),
    });
    expect(result.timing).toMatchObject({
      startedAt: expect.any(String),
      durationMs: expect.any(Number),
    });

    for (const f of result.findings) {
      expect(f.tool).toBe('vow');
      expect(typeof f.ruleId).toBe('string');
      expect(['error', 'warning', 'info']).toContain(f.severity);
      expect(typeof f.message).toBe('string');
    }

    expect(result.summary.total).toBe(result.findings.length);
  });
});
