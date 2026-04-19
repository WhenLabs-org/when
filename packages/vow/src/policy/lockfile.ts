import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPolicyText } from './cache.js';
import type { ParsedPolicy } from './types.js';

export const POLICY_LOCKFILE_NAME = 'policy.lock.json';
export const POLICY_LOCKFILE_VERSION = 1;

export interface PolicyLockfile {
  version: number;
  sourceHash: string;
  sourceFile: string;
  parsedAt: string;
  toolVersion?: string;
  policy: ParsedPolicy;
}

export function lockfilePath(projectPath: string): string {
  return path.join(projectPath, POLICY_LOCKFILE_NAME);
}

export async function readPolicyLockfile(
  projectPath: string,
): Promise<PolicyLockfile | null> {
  try {
    const content = await readFile(lockfilePath(projectPath), 'utf-8');
    const parsed = JSON.parse(content) as PolicyLockfile;
    if (parsed.version !== POLICY_LOCKFILE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writePolicyLockfile(
  projectPath: string,
  lockfile: PolicyLockfile,
): Promise<void> {
  await writeFile(
    lockfilePath(projectPath),
    JSON.stringify(lockfile, null, 2) + '\n',
    'utf-8',
  );
}

/**
 * Returns the parsed policy if the lockfile exists and its sourceHash matches
 * the current policy text; null otherwise (so caller falls back to API).
 */
export async function loadMatchingLockfile(
  projectPath: string,
  policyText: string,
): Promise<ParsedPolicy | null> {
  const lockfile = await readPolicyLockfile(projectPath);
  if (!lockfile) return null;
  if (lockfile.sourceHash !== hashPolicyText(policyText)) return null;
  return lockfile.policy;
}

export function buildLockfile(
  sourceFile: string,
  policyText: string,
  parsed: ParsedPolicy,
  toolVersion?: string,
): PolicyLockfile {
  return {
    version: POLICY_LOCKFILE_VERSION,
    sourceHash: hashPolicyText(policyText),
    sourceFile,
    parsedAt: new Date().toISOString(),
    toolVersion,
    policy: parsed,
  };
}
