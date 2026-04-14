import type { AiAnalyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { askAI, buildContext } from './client.js';
import { issueId } from '../../utils/id.js';

const SYSTEM_PROMPT = `You are a code example freshness checker. You compare code examples in documentation against the actual codebase patterns to identify outdated examples.

Return a JSON array of issues. Each issue should have:
- "line": approximate line number of the code example (number)
- "severity": "warning" for outdated patterns, "info" for minor style differences
- "message": what's outdated about the example
- "suggestion": how to modernize it

Return ONLY the JSON array, no markdown. Return [] if examples are current.`;

interface AiIssue {
  line: number;
  severity: 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export class ExamplesAnalyzer implements AiAnalyzer {
  name = 'examples';
  category = 'example' as const;
  requiresApiKey = true as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];

    for (const doc of ctx.docs) {
      // Only analyze code blocks that are actual code examples (not shell commands)
      const codeExamples = doc.codeBlocks.filter((block) => {
        if (!block.language) return false;
        if (['bash', 'sh', 'shell', 'console', 'zsh'].includes(block.language)) return false;
        if (block.commands.length > 0) return false;
        return true;
      });

      if (codeExamples.length === 0) continue;

      const context = buildContext(doc, ctx.codebase);
      const examplesText = codeExamples
        .map((ex) => `Line ${ex.line} (${ex.language}):\n\`\`\`${ex.language}\n${ex.value}\n\`\`\``)
        .join('\n\n');

      const prompt = `Check if these code examples from the documentation are up-to-date with the codebase patterns.\n\n${context}\n\n## Code Examples:\n${examplesText}`;

      try {
        const response = await askAI(prompt, ctx.config.ai.model, SYSTEM_PROMPT);
        const parsed = JSON.parse(response) as AiIssue[];

        for (const ai of parsed) {
          issues.push({
            id: issueId('example', doc.filePath, ai.line || 0),
            category: 'example',
            severity: ai.severity || 'warning',
            source: { file: doc.filePath, line: ai.line || 0, text: '' },
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
