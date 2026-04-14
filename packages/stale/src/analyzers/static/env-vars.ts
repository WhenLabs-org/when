import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { findSimilar } from '../../utils/similarity.js';
import { issueId } from '../../utils/id.js';

export class EnvVarsAnalyzer implements Analyzer {
  name = 'env-vars';
  category = 'env-var' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];

    // Collect all documented env vars
    const documentedVars = new Map<string, { file: string; line: number }>();
    for (const doc of ctx.docs) {
      for (const envVar of doc.envVars) {
        if (!documentedVars.has(envVar.name)) {
          documentedVars.set(envVar.name, { file: doc.filePath, line: envVar.line });
        }
      }
    }

    // Collect all codebase env vars
    const codebaseVarNames = ctx.codebase.envVarsUsed.map((v) => v.name);
    const codebaseVarSet = new Set(codebaseVarNames);

    // Check documented vars against codebase
    for (const [name, loc] of documentedVars) {
      if (!codebaseVarSet.has(name)) {
        const similar = findSimilar(name, codebaseVarNames, 0.4);
        issues.push({
          id: issueId('env-var', loc.file, loc.line),
          category: 'env-var',
          severity: ctx.config.severity.staleEnvVar,
          source: { file: loc.file, line: loc.line, text: name },
          message: `Documents \`${name}\` — not found in codebase`,
          suggestion: similar.length > 0
            ? `Found similar: ${similar.map((s) => `\`${s}\``).join(', ')}`
            : undefined,
          evidence: {
            expected: name,
            similarMatches: similar.length > 0 ? similar : undefined,
            codeLocations: similar.length > 0
              ? ctx.codebase.envVarsUsed
                  .filter((v) => similar.includes(v.name))
                  .map((v) => ({ file: v.file, line: v.line }))
              : undefined,
          },
        });
      }
    }

    // Check codebase vars against docs (undocumented)
    const documentedVarNames = new Set(documentedVars.keys());
    for (const envVar of ctx.codebase.envVarsUsed) {
      if (!documentedVarNames.has(envVar.name)) {
        // Only report once per var name — use the first doc file as source
        const firstDoc = ctx.docs[0];
        if (!firstDoc) continue;

        issues.push({
          id: issueId('env-var', envVar.file, envVar.line),
          category: 'env-var',
          severity: ctx.config.severity.undocumentedEnvVar,
          source: { file: firstDoc.filePath, line: 0, text: '' },
          message: `\`${envVar.name}\` is used in code but not documented`,
          evidence: {
            actual: envVar.name,
            codeLocations: [{ file: envVar.file, line: envVar.line }],
          },
        });
      }
    }

    return issues;
  }
}
