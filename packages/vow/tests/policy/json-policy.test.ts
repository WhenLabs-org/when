import { describe, it, expect } from 'vitest';
import { jsonPolicyToParsedPolicy } from '../../src/policy/json-policy.js';

describe('jsonPolicyToParsedPolicy', () => {
  it('compiles allow/deny/warn lists into rules', () => {
    const policy = jsonPolicyToParsedPolicy({
      allow: ['MIT', 'Apache-2.0'],
      deny: ['GPL-3.0'],
      warn: ['LGPL-3.0'],
    });

    const actions = policy.rules.map((r) => `${r.action}:${r.condition.values.join(',')}`);
    expect(actions).toEqual([
      'allow:MIT',
      'allow:Apache-2.0',
      'warn:LGPL-3.0',
      'block:GPL-3.0',
      'block:', // catch-all
    ]);
  });

  it('min_confidence compiles to a confidence rule at the TOP of the list', () => {
    const policy = jsonPolicyToParsedPolicy({
      allow: ['MIT'],
      min_confidence: 0.8,
    });

    const first = policy.rules[0]!;
    expect(first.condition.type).toBe('confidence');
    expect(first.condition.threshold).toBe(0.8);
    expect(first.action).toBe('warn');
  });

  it('min_confidence_action: block produces a block rule', () => {
    const policy = jsonPolicyToParsedPolicy({
      allow: ['MIT'],
      min_confidence: 0.9,
      min_confidence_action: 'block',
    });

    expect(policy.rules[0]!.action).toBe('block');
    expect(policy.rules[0]!.condition.threshold).toBe(0.9);
  });

  it('omits the confidence rule when min_confidence is not set', () => {
    const policy = jsonPolicyToParsedPolicy({ allow: ['MIT'] });
    expect(policy.rules.some((r) => r.condition.type === 'confidence')).toBe(false);
  });

  it('default action is block when allow is specified, warn otherwise', () => {
    const withAllow = jsonPolicyToParsedPolicy({ allow: ['MIT'] });
    expect(withAllow.defaultAction).toBe('block');

    const withoutAllow = jsonPolicyToParsedPolicy({ warn: ['GPL-3.0'] });
    expect(withoutAllow.defaultAction).toBe('warn');
  });
});
