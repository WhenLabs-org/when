import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeScan } from '../../src/commands/scan.js';
import { evaluatePolicy } from '../../src/policy/evaluator.js';
import {
  buildLockfile,
  loadMatchingLockfile,
  POLICY_LOCKFILE_NAME,
} from '../../src/policy/lockfile.js';
import type { ParsedPolicy } from '../../src/policy/types.js';
import YAML from 'yaml';

const FIXTURE = path.join(
  import.meta.dirname,
  'fixtures',
  'offline-policy',
);

function handCompiledPolicy(): ParsedPolicy {
  return {
    rules: [
      {
        id: 'r1',
        action: 'allow',
        condition: { type: 'license-id', values: ['MIT', 'Apache-2.0', 'ISC'] },
        originalText: 'Allow MIT, Apache-2.0, and ISC.',
      },
      {
        id: 'r2',
        action: 'block',
        condition: { type: 'license-pattern', values: [], pattern: 'GPL' },
        originalText: 'Block GPL and AGPL licenses.',
      },
      {
        id: 'r3',
        action: 'warn',
        condition: { type: 'any', values: [] },
        originalText: 'default',
      },
    ],
    sourceHash: 'filled-by-buildLockfile',
    parsedAt: new Date().toISOString(),
    defaultAction: 'warn',
  };
}

describe('offline policy flow (lockfile)', () => {
  let workdir: string;

  beforeEach(async () => {
    // Copy the fixture into a temp dir so we don't commit the lockfile to
    // the repo (and so concurrent runs don't stomp each other).
    workdir = await mkdtemp(path.join(tmpdir(), 'vow-offline-'));
    for (const file of ['package.json', 'package-lock.json', '.vow.yml']) {
      await copyFile(path.join(FIXTURE, file), path.join(workdir, file));
    }
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('committed lockfile with matching hash skips the API entirely', async () => {
    // Prime the lockfile with a hand-crafted ParsedPolicy matching the .vow.yml
    const yamlContent = await readFile(path.join(workdir, '.vow.yml'), 'utf-8');
    const yaml = YAML.parse(yamlContent) as { policy: string };
    const lockfile = buildLockfile('.vow.yml', yaml.policy, handCompiledPolicy(), '0.2.0-test');
    await writeFile(
      path.join(workdir, POLICY_LOCKFILE_NAME),
      JSON.stringify(lockfile, null, 2),
      'utf-8',
    );

    // loadMatchingLockfile reads it back
    const parsed = await loadMatchingLockfile(workdir, yaml.policy);
    expect(parsed).not.toBeNull();
    expect(parsed!.rules).toHaveLength(3);

    // And the evaluator uses it end-to-end
    const scan = await executeScan({
      path: workdir,
      production: false,
      format: 'terminal',
      registry: false,
    });
    const result = evaluatePolicy(scan, parsed!, []);
    expect(result.passed).toBe(true);
    expect(result.allowed).toHaveLength(1); // alpha (MIT)
  });

  it('lockfile with stale hash is not used (fallback to API path required)', async () => {
    // Write a lockfile that claims a DIFFERENT source hash
    const lockfile = buildLockfile(
      '.vow.yml',
      'completely different policy text',
      handCompiledPolicy(),
    );
    await writeFile(
      path.join(workdir, POLICY_LOCKFILE_NAME),
      JSON.stringify(lockfile, null, 2),
      'utf-8',
    );

    const yamlContent = await readFile(path.join(workdir, '.vow.yml'), 'utf-8');
    const yaml = YAML.parse(yamlContent) as { policy: string };

    const result = await loadMatchingLockfile(workdir, yaml.policy);
    expect(result).toBeNull();
  });
});
