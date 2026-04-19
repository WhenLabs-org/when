import semver from 'semver';
import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { issueId } from '../../utils/id.js';
import { nodeVersionFor } from '../../utils/workspace-scope.js';

function extractMajorVersion(version: string): number | null {
  const cleaned = version.replace(/^[>=<~^v]+/, '').trim();
  const parsed = semver.coerce(cleaned);
  return parsed ? parsed.major : null;
}

export class VersionsAnalyzer implements Analyzer {
  name = 'versions';
  category = 'version' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];

    for (const doc of ctx.docs) {
      const actual = nodeVersionFor(doc.filePath, ctx.codebase);
      if (!actual) continue;

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
