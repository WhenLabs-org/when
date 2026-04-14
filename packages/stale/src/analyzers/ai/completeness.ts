import type { AiAnalyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { askClaude, buildContext } from './client.js';
import { issueId } from '../../utils/id.js';

const SYSTEM_PROMPT = `You are a documentation completeness checker. You identify important setup steps, configuration options, or features that exist in the codebase but are missing from the documentation.

Return a JSON array of issues. Each issue should have:
- "severity": "warning" for important missing docs, "info" for nice-to-have
- "message": what's missing from the documentation
- "suggestion": what should be added

Return ONLY the JSON array, no markdown. Return [] if documentation is complete.`;

interface AiIssue {
  severity: 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export class CompletenessAnalyzer implements AiAnalyzer {
  name = 'completeness';
  category = 'completeness' as const;
  requiresApiKey = true as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];

    for (const doc of ctx.docs) {
      const context = buildContext(doc, ctx.codebase);
      const prompt = `Review this documentation for completeness. What important information is present in the codebase but missing from the docs?\n\n${context}`;

      try {
        const response = await askClaude(prompt, ctx.config.ai.model, SYSTEM_PROMPT);
        const parsed = JSON.parse(response) as AiIssue[];

        for (const ai of parsed) {
          issues.push({
            id: issueId('completeness', doc.filePath, 0),
            category: 'completeness',
            severity: ai.severity || 'warning',
            source: { file: doc.filePath, line: 0, text: '' },
            message: ai.message,
            suggestion: ai.suggestion,
          });
        }
      } catch {
        continue;
      }
    }

    return issues;
  }
}
