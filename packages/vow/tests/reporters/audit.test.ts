import { describe, it, expect } from 'vitest';
import { toAuditHtml } from '../../src/reporters/audit.js';
import type {
  DepGraphNode,
  PackageInfo,
  ScanResult,
  WorkspaceSummary,
} from '../../src/types.js';
import { pkgKey } from '../../src/types.js';
import type { CheckResult, PackageCheckResult } from '../../src/policy/types.js';

function makePkg(
  name: string,
  version: string,
  license: string | null,
  category: PackageInfo['license']['category'] = 'permissive',
): PackageInfo {
  return {
    name,
    version,
    ecosystem: 'npm',
    dependencyType: 'production',
    license: {
      spdxExpression: license,
      source: license ? 'package-metadata' : 'none',
      confidence: license ? 1 : 0,
      category,
    },
  };
}

function makeScan(packages: PackageInfo[]): ScanResult {
  const graph = new Map<string, DepGraphNode>();
  const byLicense = new Map<string, number>();
  for (const pkg of packages) {
    graph.set(pkgKey(pkg.name, pkg.version), {
      pkg,
      depth: 1,
      dependencies: new Map(),
      dependents: new Map(),
    });
    const l = pkg.license.spdxExpression ?? 'UNKNOWN';
    byLicense.set(l, (byLicense.get(l) ?? 0) + 1);
  }
  const workspaces: WorkspaceSummary[] = [];
  return {
    timestamp: '2026-04-19T00:00:00Z',
    project: { name: 'app', version: '1.0.0', path: '/tmp/app' },
    packages,
    graph,
    summary: {
      total: packages.length,
      byLicense,
      byCategory: new Map(),
      unknown: packages.filter((p) => p.license.category === 'unknown').length,
      custom: packages.filter((p) => p.license.category === 'custom').length,
    },
    ecosystems: ['npm'],
    workspaces,
  };
}

function makeCheck(scan: ScanResult, decisions: Array<[string, 'allow' | 'warn' | 'block']>): CheckResult {
  const packages: PackageCheckResult[] = scan.packages.map((pkg) => {
    const match = decisions.find(([name]) => name === pkg.name);
    const action = (match?.[1] ?? 'allow') as PackageCheckResult['action'];
    return {
      pkg,
      matchedRule: null,
      action,
      explanation: `test: ${action}`,
      dependencyPath: ['app@1.0.0'],
    };
  });
  return {
    policy: {
      rules: [],
      sourceHash: 'x',
      parsedAt: '2026-04-19T00:00:00Z',
      defaultAction: 'warn',
    },
    packages,
    blocked: packages.filter((p) => p.action === 'block'),
    warnings: packages.filter((p) => p.action === 'warn'),
    allowed: packages.filter((p) => p.action === 'allow'),
    passed: !packages.some((p) => p.action === 'block'),
    summary: {
      total: packages.length,
      blocked: packages.filter((p) => p.action === 'block').length,
      warnings: packages.filter((p) => p.action === 'warn').length,
      allowed: packages.filter((p) => p.action === 'allow').length,
    },
  };
}

describe('toAuditHtml', () => {
  it('renders a self-contained HTML document with project header', () => {
    const scan = makeScan([makePkg('lodash', '4.17.21', 'MIT')]);
    const html = toAuditHtml(scan, null, { now: new Date('2026-04-19T00:00:00Z') });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>vow audit — app@1.0.0</title>');
    expect(html).toContain('<h1>License Compliance Audit</h1>');
    expect(html).toContain('2026-04-19T00:00:00.000Z');
    // Inline style — no external asset fetches
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<link[^>]+href/);
    expect(html).not.toMatch(/<script/);
  });

  it('renders a package section per dep with license, category, source, confidence', () => {
    const scan = makeScan([
      makePkg('lodash', '4.17.21', 'MIT', 'permissive'),
      makePkg('evil', '1.0.0', 'GPL-3.0-only', 'strongly-copyleft'),
    ]);
    const html = toAuditHtml(scan, null);

    expect(html).toContain('lodash@4.17.21');
    expect(html).toContain('evil@1.0.0');
    expect(html).toContain('<code>MIT</code>');
    expect(html).toContain('<code>GPL-3.0-only</code>');
    expect(html).toContain('permissive');
    expect(html).toContain('strongly-copyleft');
  });

  it('applies blocked / warned / allowed CSS classes based on policy verdict', () => {
    const scan = makeScan([
      makePkg('good', '1.0.0', 'MIT'),
      makePkg('maybe', '1.0.0', 'LGPL-3.0-only'),
      makePkg('bad', '1.0.0', 'GPL-3.0-only'),
    ]);
    const check = makeCheck(scan, [
      ['good', 'allow'],
      ['maybe', 'warn'],
      ['bad', 'block'],
    ]);
    const html = toAuditHtml(scan, check);

    expect(html).toMatch(/class="pkg blocked"[^>]*id="[^"]*bad/);
    expect(html).toMatch(/class="pkg warned"[^>]*id="[^"]*maybe/);
    expect(html).toMatch(/class="pkg allowed"[^>]*id="[^"]*good/);
  });

  it('includes FAIL badge when policy check has blocked packages', () => {
    const scan = makeScan([makePkg('bad', '1.0.0', 'GPL-3.0-only')]);
    const check = makeCheck(scan, [['bad', 'block']]);
    const html = toAuditHtml(scan, check);

    expect(html).toContain('FAIL');
    expect(html).not.toContain('>PASS<');
  });

  it('embeds license text when provided, for blocked/warned/custom packages', () => {
    const scan = makeScan([makePkg('evil', '1.0.0', 'GPL-3.0-only', 'strongly-copyleft')]);
    const check = makeCheck(scan, [['evil', 'block']]);
    const texts = new Map([[pkgKey('evil', '1.0.0'), 'GNU GPL v3 text...']]);
    const html = toAuditHtml(scan, check, { licenseTexts: texts });

    expect(html).toContain('<summary>License text</summary>');
    expect(html).toContain('GNU GPL v3 text');
  });

  it('escapes HTML-unsafe content in package names', () => {
    const scan = makeScan([makePkg('<script>alert(1)</script>', '1.0.0', 'MIT')]);
    const html = toAuditHtml(scan, null);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('includes print media rules for PDF rendering', () => {
    const html = toAuditHtml(makeScan([makePkg('a', '1.0.0', 'MIT')]), null);
    expect(html).toContain('@media print');
    expect(html).toContain('page-break-inside: avoid');
  });
});
