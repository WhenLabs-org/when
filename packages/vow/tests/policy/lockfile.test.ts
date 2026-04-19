import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildLockfile,
  loadMatchingLockfile,
  POLICY_LOCKFILE_NAME,
  readPolicyLockfile,
  writePolicyLockfile,
} from '../../src/policy/lockfile.js';
import { hashPolicyText } from '../../src/policy/cache.js';
import type { ParsedPolicy } from '../../src/policy/types.js';

function makeParsedPolicy(): ParsedPolicy {
  return {
    rules: [
      {
        id: 'r1',
        action: 'allow',
        condition: { type: 'license-id', values: ['MIT'] },
        originalText: 'Allow MIT',
      },
    ],
    sourceHash: 'doesntmatter',
    parsedAt: '2026-04-19T00:00:00Z',
    defaultAction: 'warn',
  };
}

describe('policy lockfile', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'vow-lock-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('readPolicyLockfile returns null when lockfile is missing', async () => {
    expect(await readPolicyLockfile(root)).toBeNull();
  });

  it('readPolicyLockfile returns null for wrong version', async () => {
    await writeFile(
      path.join(root, POLICY_LOCKFILE_NAME),
      JSON.stringify({ version: 999, sourceHash: 'x', policy: {} }),
      'utf-8',
    );
    expect(await readPolicyLockfile(root)).toBeNull();
  });

  it('write + read round-trips', async () => {
    const text = 'Allow MIT. Block GPL.';
    const lockfile = buildLockfile('.vow.yml', text, makeParsedPolicy(), '0.2.0');
    await writePolicyLockfile(root, lockfile);

    const read = await readPolicyLockfile(root);
    expect(read).not.toBeNull();
    expect(read!.sourceHash).toBe(hashPolicyText(text));
    expect(read!.sourceFile).toBe('.vow.yml');
    expect(read!.toolVersion).toBe('0.2.0');
    expect(read!.policy.rules).toHaveLength(1);
  });

  it('writes a trailing newline (friendlier to git)', async () => {
    const lockfile = buildLockfile('.vow.yml', 'text', makeParsedPolicy());
    await writePolicyLockfile(root, lockfile);
    const content = await readFile(path.join(root, POLICY_LOCKFILE_NAME), 'utf-8');
    expect(content.endsWith('\n')).toBe(true);
  });

  it('loadMatchingLockfile returns the parsed policy when hashes match', async () => {
    const text = 'Allow MIT. Block GPL.';
    const lockfile = buildLockfile('.vow.yml', text, makeParsedPolicy());
    await writePolicyLockfile(root, lockfile);

    const result = await loadMatchingLockfile(root, text);
    expect(result).not.toBeNull();
    expect(result!.rules).toHaveLength(1);
  });

  it('loadMatchingLockfile returns null when the policy text has changed', async () => {
    const lockfile = buildLockfile('.vow.yml', 'Allow MIT.', makeParsedPolicy());
    await writePolicyLockfile(root, lockfile);

    const result = await loadMatchingLockfile(root, 'Allow MIT. Block GPL.');
    expect(result).toBeNull();
  });

  it('hash ignores whitespace differences', async () => {
    const lockfile = buildLockfile('.vow.yml', 'Allow MIT.  Block GPL.', makeParsedPolicy());
    await writePolicyLockfile(root, lockfile);

    // Same semantic content, different whitespace
    const result = await loadMatchingLockfile(root, 'Allow MIT. Block GPL.');
    expect(result).not.toBeNull();
  });
});
