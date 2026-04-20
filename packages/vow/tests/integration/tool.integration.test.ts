import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTool } from '../../src/tool.js';
import { executeScan } from '../../src/commands/scan.js';
import { toCycloneDx, toSpdx } from '../../src/reporters/sbom.js';
import { evaluatePolicy } from '../../src/policy/evaluator.js';
import { loadJsonPolicy } from '../../src/policy/json-policy.js';
import { type ScanResult as VowScanResult } from '../../src/types.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

function stubResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

describe('createTool() — end-to-end with .vow.json policies', () => {
  it('clean-mit fixture: passes, no error findings', async () => {
    const tool = createTool();
    const result = await tool.scan({ cwd: path.join(FIXTURES, 'clean-mit') });

    expect(result.ok).toBe(true);
    expect(result.summary.errors).toBe(0);

    const blocks = result.findings.filter((f) => f.ruleId === 'policy-block');
    expect(blocks).toHaveLength(0);

    const policyExtra = result.summary.extra?.['policy'] as
      | { passed: boolean; blocked: number; warnings: number; sourceFile: string | null }
      | undefined;
    expect(policyExtra).toBeDefined();
    expect(policyExtra!.passed).toBe(true);
    expect(policyExtra!.blocked).toBe(0);
    expect(policyExtra!.sourceFile).toMatch(/\.vow\.json$/);
  });

  it('gpl-contaminated fixture: fails, emits policy-block for GPL dep', async () => {
    const tool = createTool();
    const result = await tool.scan({ cwd: path.join(FIXTURES, 'gpl-contaminated') });

    expect(result.ok).toBe(false);
    expect(result.summary.errors).toBeGreaterThanOrEqual(1);

    const blocks = result.findings.filter((f) => f.ruleId === 'policy-block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.severity).toBe('error');
    expect(blocks[0]!.message).toContain('tainted');
    expect(blocks[0]!.message).toContain('GPL-3.0-only');

    const data = blocks[0]!.data as { name: string; dependencyPath: string[] };
    expect(data.name).toBe('tainted');
    expect(Array.isArray(data.dependencyPath)).toBe(true);
  });

  it('no-policy fixture: baseline unknown-license warning still emitted', async () => {
    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'no-policy'),
      options: { registry: false },
    });

    const unknowns = result.findings.filter((f) => f.ruleId === 'unknown-license');
    expect(unknowns).toHaveLength(1);
    expect(unknowns[0]!.severity).toBe('warning');
    expect(unknowns[0]!.message).toContain('mystery');

    expect(result.summary.extra?.['policy']).toBeUndefined();
  });

  it('policy-dedup fixture: policy finding suppresses baseline unknown-license', async () => {
    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'policy-dedup'),
      options: { registry: false },
    });

    const forMystery = result.findings.filter((f) => {
      const data = f.data as { name?: string } | undefined;
      return data?.name === 'mystery';
    });
    expect(forMystery).toHaveLength(1);
    expect(forMystery[0]!.ruleId).toMatch(/^policy-(block|warn)$/);
  });

  it('registry fallback: resolves license for packages missing metadata', async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), 'vow-registry-test-'));
    try {
      const fetchFn = async (url: string) => {
        if (url.includes('/mystery/')) return stubResponse({ license: 'MIT' });
        return stubResponse({}, { status: 404 });
      };

      const tool = createTool();
      const result = await tool.scan({
        cwd: path.join(FIXTURES, 'no-policy'),
        options: { registryFetch: fetchFn as typeof fetch },
      });

      const unknowns = result.findings.filter((f) => f.ruleId === 'unknown-license');
      expect(unknowns).toHaveLength(0);

      const native = result.raw as VowScanResult;
      const mystery = native.packages.find((p) => p.name === 'mystery');
      expect(mystery).toBeDefined();
      expect(mystery!.license.spdxExpression).toBe('MIT');
      expect(mystery!.license.source).toBe('registry-api');
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('registry=false disables the fallback even when a package is unresolved', async () => {
    const fetchFn = async () => stubResponse({ license: 'MIT' });

    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'no-policy'),
      options: { registry: false, registryFetch: fetchFn as typeof fetch },
    });

    const native = result.raw as VowScanResult;
    const mystery = native.packages.find((p) => p.name === 'mystery');
    expect(mystery!.license.category).toBe('unknown');
    expect(mystery!.license.source).toBe('none');
  });


  it('vow sbom end-to-end: CycloneDX + SPDX on a mixed-ecosystem scan', async () => {
    const fetchFn = async (url: string): Promise<Response> => {
      if (url.includes('crates.io') && url.includes('/serde/')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { version: { license: 'MIT OR Apache-2.0' } };
          },
        } as unknown as Response;
      }
      if (url.includes('crates.io') && url.includes('/evil-crate/')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { version: { license: 'GPL-3.0-only' } };
          },
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 404,
        async json() {
          return {};
        },
      } as unknown as Response;
    };

    const scan = await executeScan({
      path: path.join(FIXTURES, 'cargo-project'),
      production: false,
      format: 'terminal',
      registryFetch: fetchFn as typeof fetch,
    });

    const cyclonedx = toCycloneDx(scan, {
      now: new Date('2026-04-19T00:00:00Z'),
      documentId: 'test-uuid',
    });
    expect(cyclonedx.bomFormat).toBe('CycloneDX');
    expect(cyclonedx.components).toHaveLength(2);
    const serde = cyclonedx.components.find((c) => c.name === 'serde')!;
    expect(serde.purl).toBe('pkg:cargo/serde@1.0.188');
    expect(serde.licenses).toEqual([{ expression: 'MIT OR Apache-2.0' }]);

    const spdx = toSpdx(scan, {
      now: new Date('2026-04-19T00:00:00Z'),
      documentId: 'test-uuid',
    });
    expect(spdx.spdxVersion).toBe('SPDX-2.3');
    // root package + 2 crates = 3 entries
    expect(spdx.packages).toHaveLength(3);
    const spdxEvil = spdx.packages.find((p) => p.name === 'evil-crate')!;
    expect(spdxEvil.licenseConcluded).toBe('GPL-3.0-only');
    expect(spdxEvil.externalRefs![0]!.referenceLocator).toBe('pkg:cargo/evil-crate@0.1.0');
  });

  it('monorepo: discovers workspaces and picks up their direct deps', async () => {
    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'monorepo'),
      options: { registry: false },
    });

    const native = result.raw as VowScanResult;
    expect(native.workspaces).toHaveLength(2);

    const names = native.workspaces.map((w) => w.name).sort();
    expect(names).toEqual(['@mono/app-a', '@mono/app-b']);

    const appA = native.workspaces.find((w) => w.name === '@mono/app-a')!;
    expect(appA.directDependencies).toEqual(['ws-dep']);

    const appB = native.workspaces.find((w) => w.name === '@mono/app-b')!;
    expect(appB.directDependencies).toEqual(['some-other-thing']);

    // The root package.json has NO dependencies; ws-dep is only a dep of
    // app-a. Without workspace discovery this would be classified with an
    // infinite depth (no direct root path). With discovery it should be at
    // depth 1 since the monorepo treats workspace deps as direct.
    const wsDep = native.packages.find((p) => p.name === 'ws-dep');
    expect(wsDep).toBeDefined();
    const wsNode = native.graph.get('ws-dep@1.0.0');
    expect(wsNode!.depth).toBe(1);
  });

  it('pip resolver: captures [package.dependencies] as graph edges', async () => {
    const fetchFn = async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        async json() {
          return { info: { license: 'MIT' } };
        },
      }) as unknown as Response;

    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'pip-project'),
      options: { registryFetch: fetchFn as typeof fetch, policy: 'off' },
    });

    const native = result.raw as VowScanResult;
    const requests = native.packages.find((p) => p.name === 'requests');
    expect(requests).toBeDefined();

    // The resolver should have captured charset-normalizer + urllib3 from
    // [package.dependencies] so the graph has real edges for pip packages
    // (was empty-array hardcoded before the fix).
    const node = native.graph.get('requests@2.31.0');
    expect(node).toBeDefined();
    expect([...node!.dependencies.keys()].sort()).toEqual(['charset-normalizer', 'urllib3']);
  });

  it('pip project (poetry.lock): resolves via PyPI stub; GPL classifier gets blocked', async () => {
    const bodiesByFragment: Record<string, { info: Record<string, unknown> }> = {
      '/requests/2.31.0/': { info: { license: 'Apache-2.0' } },
      '/charset-normalizer/3.3.2/': { info: { license: 'MIT' } },
      '/urllib3/2.0.7/': { info: { license: 'MIT' } },
      '/risky-dep/1.0.0/': {
        info: {
          license: '',
          classifiers: [
            'License :: OSI Approved :: GNU General Public License v3 (GPLv3)',
          ],
        },
      },
    };
    const fetchFn = async (url: string): Promise<Response> => {
      for (const [fragment, body] of Object.entries(bodiesByFragment)) {
        if (url.includes(fragment)) {
          return {
            ok: true,
            status: 200,
            async json() {
              return body;
            },
          } as unknown as Response;
        }
      }
      return {
        ok: false,
        status: 404,
        async json() {
          return {};
        },
      } as unknown as Response;
    };

    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'pip-project'),
      options: { registryFetch: fetchFn as typeof fetch },
    });

    const native = result.raw as VowScanResult;
    expect(native.ecosystems).toContain('pip');

    const requests = native.packages.find((p) => p.name === 'requests');
    expect(requests!.license.spdxExpression).toBe('Apache-2.0');
    expect(requests!.license.source).toBe('registry-api');

    const risky = native.packages.find((p) => p.name === 'risky-dep');
    expect(risky!.license.spdxExpression).toBe('GPL-3.0-only');

    const blocks = result.findings.filter((f) => f.ruleId === 'policy-block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.message).toContain('risky-dep');
    expect(result.ok).toBe(false);
  });

  it('cargo project: resolves crates via crates.io stub and enforces policy', async () => {
    const fetchFn = async (url: string): Promise<Response> => {
      if (url.includes('/serde/1.0.188')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { version: { license: 'MIT OR Apache-2.0' } };
          },
        } as unknown as Response;
      }
      if (url.includes('/evil-crate/0.1.0')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { version: { license: 'GPL-3.0-only' } };
          },
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 404,
        async json() {
          return {};
        },
      } as unknown as Response;
    };

    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'cargo-project'),
      options: { registryFetch: fetchFn as typeof fetch },
    });

    const native = result.raw as VowScanResult;
    expect(native.ecosystems).toContain('cargo');

    const serde = native.packages.find((p) => p.name === 'serde');
    expect(serde).toBeDefined();
    expect(serde!.license.spdxExpression).toBe('MIT OR Apache-2.0');
    expect(serde!.license.source).toBe('registry-api');

    const evil = native.packages.find((p) => p.name === 'evil-crate');
    expect(evil!.license.spdxExpression).toBe('GPL-3.0-only');

    const blocks = result.findings.filter((f) => f.ruleId === 'policy-block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.message).toContain('evil-crate');
    expect(result.ok).toBe(false);
  });

  it('dual-licensed package: combines LICENSE-MIT + LICENSE-APACHE into (MIT OR Apache-2.0)', async () => {
    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'dual-licensed'),
      options: { registry: false },
    });

    const native = result.raw as VowScanResult;
    const dual = native.packages.find((p) => p.name === 'dual-lib');
    expect(dual).toBeDefined();
    expect(dual!.license.source).toBe('license-file');

    const expr = dual!.license.spdxExpression;
    expect(expr).toMatch(/^\(MIT OR Apache-2\.0\)$|^\(Apache-2\.0 OR MIT\)$/);
  });

  it('min_confidence: fires policy-warn for a low-confidence match even if license is allowed', async () => {
    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'low-confidence'),
      options: { registry: false },
    });

    const native = result.raw as VowScanResult;
    const fuzzy = native.packages.find((p) => p.name === 'fuzzy');
    expect(fuzzy).toBeDefined();
    expect(fuzzy!.license.spdxExpression).toBe('MIT');
    expect(fuzzy!.license.confidence).toBeLessThan(0.95);

    const warns = result.findings.filter((f) => f.ruleId === 'policy-warn');
    expect(warns).toHaveLength(1);
    expect(warns[0]!.message).toContain('fuzzy');

    const blocks = result.findings.filter((f) => f.ruleId === 'policy-block');
    expect(blocks).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it('policy=off disables evaluation even when .vow.json exists', async () => {
    const tool = createTool();
    const result = await tool.scan({
      cwd: path.join(FIXTURES, 'gpl-contaminated'),
      options: { policy: 'off' },
    });

    expect(result.findings.filter((f) => f.ruleId === 'policy-block')).toHaveLength(0);
    expect(result.summary.extra?.['policy']).toBeUndefined();
  });
});
