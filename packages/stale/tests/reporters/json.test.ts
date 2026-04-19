import { describe, it, expect } from 'vitest';
import { JsonReporter } from '../../src/reporters/json.js';
import { canonicalReport } from './fixtures.js';

describe('JsonReporter', () => {
  it('renders valid JSON', () => {
    const out = new JsonReporter().render(canonicalReport());
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('matches the canonical snapshot', () => {
    const parsed = JSON.parse(new JsonReporter().render(canonicalReport())) as Record<string, unknown>;
    // scannedAt is serialized as ISO string — deterministic thanks to the fixture
    expect(parsed).toMatchSnapshot();
  });

  it('preserves all issues', () => {
    const parsed = JSON.parse(new JsonReporter().render(canonicalReport())) as { issues: unknown[] };
    expect(parsed.issues).toHaveLength(3);
  });
});
