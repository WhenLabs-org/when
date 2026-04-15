import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { issueId } from '../../utils/id.js';

export class PortsAnalyzer implements Analyzer {
  name = 'ports';
  category = 'url' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    const { configPorts } = ctx.codebase;

    if (configPorts.length === 0) return issues;

    for (const doc of ctx.docs) {
      for (const claim of doc.portClaims) {
        const conflict = configPorts.find((cp) => cp.port !== claim.port);
        const exact = configPorts.find((cp) => cp.port === claim.port);

        // If the doc port matches a config port, no issue
        if (exact) continue;

        // If there are config ports but none match the doc claim, flag it
        if (conflict) {
          issues.push({
            id: issueId('url', doc.filePath, claim.line),
            category: 'url',
            severity: ctx.config.severity.portMismatch,
            source: { file: doc.filePath, line: claim.line, text: claim.context },
            message: `Says port ${claim.port}, but ${conflict.source} sets port ${conflict.port}`,
            suggestion: `Update documentation to reference port ${conflict.port}`,
            evidence: { expected: String(claim.port), actual: String(conflict.port) },
          });
        }
      }
    }

    return issues;
  }
}
