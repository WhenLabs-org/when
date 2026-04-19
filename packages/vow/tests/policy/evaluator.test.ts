import { describe, it, expect } from 'vitest';
import { evaluatePackage, evaluatePolicy } from '../../src/policy/evaluator.js';
import type { ParsedPolicyRule, ParsedPolicy } from '../../src/policy/types.js';
import type { PackageInfo, ScanResult } from '../../src/types.js';

function makePackage(name: string, license: string | null, category: string = 'permissive', depType: string = 'production'): PackageInfo {
  return {
    name,
    version: '1.0.0',
    license: {
      spdxExpression: license,
      source: 'package-metadata',
      confidence: 1,
      category: category as PackageInfo['license']['category'],
    },
    dependencyType: depType as PackageInfo['dependencyType'],
  };
}

function makeRule(
  id: string,
  action: 'allow' | 'block' | 'warn',
  type: 'license-id' | 'license-category' | 'license-pattern' | 'any',
  values: string[],
  opts: { scope?: string[]; negate?: boolean; pattern?: string } = {},
): ParsedPolicyRule {
  return {
    id,
    action,
    condition: {
      type,
      values,
      negate: opts.negate ?? false,
      pattern: opts.pattern,
    },
    scope: opts.scope as ParsedPolicyRule['scope'],
    originalText: `${action} rule for ${values.join(', ')}`,
  };
}

describe('evaluatePackage', () => {
  it('allows MIT when MIT is in allow list', () => {
    const rules = [makeRule('r1', 'allow', 'license-id', ['MIT'])];
    const pkg = makePackage('test', 'MIT');
    const result = evaluatePackage(pkg, rules, 'warn');
    expect(result.action).toBe('allow');
    expect(result.matchedRule?.id).toBe('r1');
  });

  it('blocks GPL when GPL is in block list', () => {
    const rules = [makeRule('r1', 'block', 'license-id', ['GPL-3.0-only'])];
    const pkg = makePackage('test', 'GPL-3.0-only', 'strongly-copyleft');
    const result = evaluatePackage(pkg, rules, 'warn');
    expect(result.action).toBe('block');
  });

  it('applies default action when no rule matches', () => {
    const rules = [makeRule('r1', 'allow', 'license-id', ['MIT'])];
    const pkg = makePackage('test', 'Apache-2.0');
    const result = evaluatePackage(pkg, rules, 'warn');
    expect(result.action).toBe('warn');
    expect(result.matchedRule).toBeNull();
  });

  it('uses first-match-wins ordering', () => {
    const rules = [
      makeRule('r1', 'allow', 'license-id', ['MIT']),
      makeRule('r2', 'block', 'license-id', ['MIT']),
    ];
    const pkg = makePackage('test', 'MIT');
    const result = evaluatePackage(pkg, rules, 'warn');
    expect(result.action).toBe('allow');
    expect(result.matchedRule?.id).toBe('r1');
  });

  it('respects scope filtering', () => {
    const rules = [
      makeRule('r1', 'allow', 'license-id', ['GPL-3.0-only'], { scope: ['dev'] }),
      makeRule('r2', 'block', 'license-id', ['GPL-3.0-only']),
    ];

    const devPkg = makePackage('test-dev', 'GPL-3.0-only', 'strongly-copyleft', 'dev');
    const devResult = evaluatePackage(devPkg, rules, 'warn');
    expect(devResult.action).toBe('allow');

    const prodPkg = makePackage('test-prod', 'GPL-3.0-only', 'strongly-copyleft', 'production');
    const prodResult = evaluatePackage(prodPkg, rules, 'warn');
    expect(prodResult.action).toBe('block');
  });

  it('matches by license category', () => {
    const rules = [makeRule('r1', 'block', 'license-category', ['strongly-copyleft'])];
    const pkg = makePackage('test', 'GPL-3.0-only', 'strongly-copyleft');
    const result = evaluatePackage(pkg, rules, 'warn');
    expect(result.action).toBe('block');
  });

  it('matches by license pattern', () => {
    const rules = [makeRule('r1', 'block', 'license-pattern', ['GPL'], { pattern: 'gpl' })];
    const pkg = makePackage('test', 'GPL-3.0-only', 'strongly-copyleft');
    const result = evaluatePackage(pkg, rules, 'warn');
    expect(result.action).toBe('block');
  });

  it('handles unknown license (null spdxExpression)', () => {
    const rules = [makeRule('r1', 'block', 'license-category', ['unknown'])];
    const pkg = makePackage('test', null, 'unknown');
    const result = evaluatePackage(pkg, rules, 'warn');
    expect(result.action).toBe('block');
  });

  it('handles catch-all rule', () => {
    const rules = [
      makeRule('r1', 'allow', 'license-id', ['MIT']),
      makeRule('r2', 'warn', 'any', []),
    ];
    const pkg = makePackage('test', 'Apache-2.0');
    const result = evaluatePackage(pkg, rules, 'allow');
    expect(result.action).toBe('warn');
    expect(result.matchedRule?.id).toBe('r2');
  });

  it('handles OR expression — allows if any branch is allowed', () => {
    const rules = [makeRule('r1', 'allow', 'license-id', ['MIT'])];
    const pkg = makePackage('test', '(MIT OR GPL-3.0-only)');
    const result = evaluatePackage(pkg, rules, 'block');
    expect(result.action).toBe('allow');
  });

  it('handles OR expression — blocks only if all branches are blocked', () => {
    const rules = [makeRule('r1', 'block', 'license-id', ['GPL-3.0-only'])];
    const pkg = makePackage('test', '(MIT OR GPL-3.0-only)');
    const result = evaluatePackage(pkg, rules, 'allow');
    // Should NOT block because MIT is available as alternative
    expect(result.action).toBe('allow'); // default action, since block requires ALL branches blocked
  });

  it('handles negated condition', () => {
    const rules = [makeRule('r1', 'warn', 'license-id', ['MIT', 'Apache-2.0', 'ISC'], { negate: true })];
    const pkg = makePackage('test', 'GPL-3.0-only', 'strongly-copyleft');
    const result = evaluatePackage(pkg, rules, 'allow');
    expect(result.action).toBe('warn'); // GPL is NOT in [MIT, Apache, ISC], so negate=true matches
  });
});

describe('evaluatePolicy', () => {
  it('produces correct summary', () => {
    const policy: ParsedPolicy = {
      rules: [
        makeRule('r1', 'allow', 'license-id', ['MIT']),
        makeRule('r2', 'block', 'license-category', ['strongly-copyleft']),
        makeRule('r3', 'warn', 'any', []),
      ],
      sourceHash: 'test',
      parsedAt: new Date().toISOString(),
      defaultAction: 'warn',
    };

    const scanResult: ScanResult = {
      timestamp: new Date().toISOString(),
      project: { name: 'test', version: '1.0.0', path: '/test' },
      packages: [
        makePackage('a', 'MIT'),
        makePackage('b', 'GPL-3.0-only', 'strongly-copyleft'),
        makePackage('c', 'Apache-2.0'),
      ],
      graph: new Map(),
      summary: { total: 3, byLicense: new Map(), byCategory: new Map(), unknown: 0, custom: 0 },
      ecosystems: ['npm'],
      workspaces: [],
    };

    const result = evaluatePolicy(scanResult, policy);
    expect(result.summary.total).toBe(3);
    expect(result.summary.allowed).toBe(1); // MIT
    expect(result.summary.blocked).toBe(1); // GPL
    expect(result.summary.warnings).toBe(1); // Apache-2.0 (catch-all warn)
    expect(result.passed).toBe(false);
  });

  describe('confidence condition', () => {
    const lowConfPkg: PackageInfo = {
      name: 'fuzzy',
      version: '1.0.0',
      license: {
        spdxExpression: 'MIT',
        source: 'license-file',
        confidence: 0.72,
        category: 'permissive',
      },
      dependencyType: 'production',
    };

    const highConfPkg: PackageInfo = {
      name: 'sharp',
      version: '1.0.0',
      license: {
        spdxExpression: 'MIT',
        source: 'package-metadata',
        confidence: 1,
        category: 'permissive',
      },
      dependencyType: 'production',
    };

    it('matches when license confidence < threshold', () => {
      const rule: ParsedPolicyRule = {
        id: 'conf',
        action: 'warn',
        condition: { type: 'confidence', values: [], threshold: 0.8 },
        originalText: 'Warn when confidence < 0.8',
      };

      const low = evaluatePackage(lowConfPkg, [rule], 'allow');
      expect(low.action).toBe('warn');
      expect(low.matchedRule?.id).toBe('conf');

      const high = evaluatePackage(highConfPkg, [rule], 'allow');
      expect(high.action).toBe('allow');
      expect(high.matchedRule).toBeNull();
    });

    it('accepts numeric threshold via pattern string for backward compat', () => {
      const rule: ParsedPolicyRule = {
        id: 'conf',
        action: 'block',
        condition: { type: 'confidence', values: [], pattern: '0.9' },
        originalText: 'Block when confidence < 0.9',
      };

      const low = evaluatePackage(lowConfPkg, [rule], 'allow');
      expect(low.action).toBe('block');
    });

    it('ignores condition when no valid threshold provided', () => {
      const rule: ParsedPolicyRule = {
        id: 'conf',
        action: 'block',
        condition: { type: 'confidence', values: [] },
        originalText: 'malformed',
      };

      const low = evaluatePackage(lowConfPkg, [rule], 'allow');
      expect(low.action).toBe('allow');
    });

    it('fires BEFORE license-id rules (first-match-wins)', () => {
      const confRule: ParsedPolicyRule = {
        id: 'conf',
        action: 'warn',
        condition: { type: 'confidence', values: [], threshold: 0.9 },
        originalText: 'Warn when confidence < 0.9',
      };
      const allowMit: ParsedPolicyRule = {
        id: 'mit',
        action: 'allow',
        condition: { type: 'license-id', values: ['MIT'] },
        originalText: 'Allow MIT',
      };

      const result = evaluatePackage(lowConfPkg, [confRule, allowMit], 'block');
      expect(result.action).toBe('warn');
      expect(result.matchedRule?.id).toBe('conf');
    });
  });

  describe('ignore patterns', () => {
    const gplPkg: PackageInfo = {
      name: '@internal/gpl-tool',
      version: '1.0.0',
      license: {
        spdxExpression: 'GPL-3.0-only',
        source: 'package-metadata',
        confidence: 1,
        category: 'strongly-copyleft',
      },
      dependencyType: 'production',
    };

    it('ignore pattern short-circuits a block rule', () => {
      const policy: ParsedPolicy = {
        rules: [makeRule('r1', 'block', 'license-id', ['GPL-3.0-only'])],
        sourceHash: 'test',
        parsedAt: new Date().toISOString(),
        defaultAction: 'allow',
      };

      const scanResult: ScanResult = {
        timestamp: new Date().toISOString(),
        project: { name: 'test', version: '1.0.0', path: '/test' },
        packages: [gplPkg],
        graph: new Map(),
        summary: { total: 1, byLicense: new Map(), byCategory: new Map(), unknown: 0, custom: 0 },
        ecosystems: ['npm'],
        workspaces: [],
      };

      const result = evaluatePolicy(scanResult, policy, {
        ignorePatterns: ['@internal/*'],
      });

      expect(result.blocked).toHaveLength(0);
      expect(result.allowed).toHaveLength(1);
      expect(result.allowed[0]!.explanation).toContain('Ignored by pattern');
      expect(result.passed).toBe(true);
    });

    it('package not matching any ignore pattern is still blocked', () => {
      const policy: ParsedPolicy = {
        rules: [makeRule('r1', 'block', 'license-id', ['GPL-3.0-only'])],
        sourceHash: 'test',
        parsedAt: new Date().toISOString(),
        defaultAction: 'allow',
      };
      const scanResult: ScanResult = {
        timestamp: new Date().toISOString(),
        project: { name: 'test', version: '1.0.0', path: '/test' },
        packages: [{ ...gplPkg, name: 'public-gpl' }],
        graph: new Map(),
        summary: { total: 1, byLicense: new Map(), byCategory: new Map(), unknown: 0, custom: 0 },
        ecosystems: ['npm'],
        workspaces: [],
      };

      const result = evaluatePolicy(scanResult, policy, {
        ignorePatterns: ['@internal/*'],
      });
      expect(result.blocked).toHaveLength(1);
    });
  });

  it('applies overrides', () => {
    const policy: ParsedPolicy = {
      rules: [makeRule('r1', 'block', 'license-id', ['GPL-3.0-only'])],
      sourceHash: 'test',
      parsedAt: new Date().toISOString(),
      defaultAction: 'allow',
    };

    const scanResult: ScanResult = {
      timestamp: new Date().toISOString(),
      project: { name: 'test', version: '1.0.0', path: '/test' },
      packages: [makePackage('gpl-pkg', 'GPL-3.0-only', 'strongly-copyleft')],
      graph: new Map(),
      summary: { total: 1, byLicense: new Map(), byCategory: new Map(), unknown: 0, custom: 0 },
      ecosystems: ['npm'],
      workspaces: [],
    };

    const result = evaluatePolicy(scanResult, policy, [
      { package: 'gpl-pkg@1.0.0', action: 'allow', reason: 'Approved by legal' },
    ]);

    expect(result.summary.blocked).toBe(0);
    expect(result.summary.allowed).toBe(1);
    expect(result.allowed[0]!.explanation).toContain('Approved by legal');
  });
});
