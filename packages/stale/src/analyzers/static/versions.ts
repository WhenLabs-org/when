import semver from 'semver';
import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { issueId } from '../../utils/id.js';

function extractMajorVersion(version: string): number | null {
  const cleaned = version.replace(/^[>=<~^v]+/, '').trim();
  const parsed = semver.coerce(cleaned);
  return parsed ? parsed.major : null;
}

function getActualVersionString(ctx: AnalyzerContext): { version: string; source: string } | null {
  const nv = ctx.codebase.nodeVersion;
  if (!nv) return null;

  if (nv.fromEngines) return { version: nv.fromEngines, source: 'package.json engines' };
  if (nv.fromNvmrc) return { version: nv.fromNvmrc, source: '.nvmrc' };
  if (nv.fromNodeVersion) return { version: nv.fromNodeVersion, source: '.node-version' };
  if (nv.fromDockerfile) return { version: nv.fromDockerfile, source: 'Dockerfile' };
  return null;
}

export class VersionsAnalyzer implements Analyzer {
  name = 'versions';
  category = 'version' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];

    const actual = getActualVersionString(ctx);
    if (!actual) return issues;

    for (const doc of ctx.docs) {
      for (const claim of doc.versionClaims) {
        if (claim.runtime !== 'node') continue;

        const claimedMajor = extractMajorVersion(claim.version);
        const actualMajor = extractMajorVersion(actual.version);

        if (claimedMajor === null || actualMajor === null) continue;

        if (claimedMajor !== actualMajor) {
          issues.push({
            id: issueId('version', doc.filePath, claim.line),
            category: 'version',
            severity: ctx.config.severity.versionMismatch,
            source: { file: doc.filePath, line: claim.line, text: claim.rawText },
            message: `Says "${claim.rawText}" but ${actual.source} specifies ${actual.version}`,
            evidence: { expected: claim.version, actual: actual.version },
          });
        }
      }
    }

    return issues;
  }
}
