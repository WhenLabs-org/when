import { describe, it, expect } from 'vitest';
import { MarkdownReporter } from '../../src/reporters/markdown.js';
import { canonicalReport } from './fixtures.js';

describe('MarkdownReporter', () => {
  it('renders the canonical report as a stable snapshot', () => {
    const out = new MarkdownReporter().render(canonicalReport());
    expect(out).toMatchSnapshot();
  });

  it('renders a clean-run report as ✅', () => {
    const r = canonicalReport();
    r.issues = [];
    r.summary = { ...r.summary, errors: 0, warnings: 0, infos: 0, passed: 10 };
    const out = new MarkdownReporter().render(r);
    expect(out).toContain('✅');
    expect(out).toContain('No documentation drift detected');
  });

  it('groups issues by category', () => {
    const out = new MarkdownReporter().render(canonicalReport());
    expect(out).toContain('File Paths');
    expect(out).toContain('Commands');
    expect(out).toContain('Environment Variables');
  });

  it('includes suggestions when present', () => {
    const out = new MarkdownReporter().render(canonicalReport());
    expect(out).toContain('Update to `src/db.ts`');
  });
});
