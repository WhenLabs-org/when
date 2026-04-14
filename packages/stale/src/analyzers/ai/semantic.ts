import type { AiAnalyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { askAI, buildContext } from './client.js';
import { issueId } from '../../utils/id.js';

const SYSTEM_PROMPT = `You are a documentation drift detector. You analyze documentation sections against actual codebase facts to find inaccuracies.

Return a JSON array of issues. Each issue should have:
- "line": approximate line number in the doc (number)
- "severity": "error" for definite inaccuracies, "warning" for likely inaccuracies
- "message": clear description of what's wrong
- "suggestion": how to fix it

Return ONLY the JSON array, no markdown or explanation. Return [] if no issues found.`;

interface AiIssue {
  line: number;
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

export class SemanticAnalyzer implements AiAnalyzer {
  name = 'semantic';
  category = 'semantic' as const;
  requiresApiKey = true as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];

    for (const doc of ctx.docs) {
      for (const section of doc.sections) {
        // Skip very short sections or headings-only
        if (section.content.trim().length < 50) continue;

        const context = buildContext(doc, ctx.codebase, section);
        const prompt = `Analyze this documentation section for inaccuracies compared to the actual codebase facts.\n\n${context}`;

        try {
          const response = await askAI(prompt, ctx.config.ai.model, SYSTEM_PROMPT);
          const parsed = JSON.parse(response) as AiIssue[];

          for (const ai of parsed) {
            issues.push({
              id: issueId('semantic', doc.filePath, ai.line || section.line),
              category: 'semantic',
              severity: ai.severity || 'warning',
              source: {
                file: doc.filePath,
                line: ai.line || section.line,
                text: section.heading,
              },
              message: ai.message,
              suggestion: ai.suggestion,
            });
          }
        } catch {
          // Skip sections that fail to analyze
          continue;
        }
      }
    }

    return issues;
  }
}
