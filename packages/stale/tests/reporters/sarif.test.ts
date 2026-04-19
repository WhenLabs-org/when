import { describe, it, expect } from 'vitest';
import { SarifReporter } from '../../src/reporters/sarif.js';
import { canonicalReport } from './fixtures.js';

describe('SarifReporter', () => {
  it('matches the canonical snapshot', () => {
    const out = JSON.parse(new SarifReporter().render(canonicalReport())) as Record<string, unknown>;
    expect(out).toMatchSnapshot();
  });

  it('emits SARIF 2.1.0 schema', () => {
    const parsed = JSON.parse(new SarifReporter().render(canonicalReport())) as { version: string };
    expect(parsed.version).toBe('2.1.0');
  });

  it('maps severities to SARIF levels', () => {
    const parsed = JSON.parse(new SarifReporter().render(canonicalReport())) as {
      runs: { results: { ruleId: string; level: string }[] }[];
    };
    const results = parsed.runs[0].results;
    const filePath = results.find((r) => r.ruleId === 'stale/file-path');
    const command = results.find((r) => r.ruleId === 'stale/command');
    const envVar = results.find((r) => r.ruleId === 'stale/env-var');
    expect(filePath?.level).toBe('error');
    expect(command?.level).toBe('warning');
    expect(envVar?.level).toBe('note');
  });
});
