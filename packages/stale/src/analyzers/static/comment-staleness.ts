import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { issueId } from '../../utils/id.js';

// Match single-line comments: // ... or # ...
const SINGLE_LINE_COMMENT = /(?:\/\/|#)\s*(.+)$/;
// Match multi-line comment content lines: * ...
const MULTI_LINE_COMMENT_LINE = /^\s*\*\s*(.+)$/;

// Match symbol-like references in comments (camelCase, PascalCase, snake_case identifiers)
const SYMBOL_REF_REGEX = /\b([a-zA-Z_$][\w$]{2,})\s*\(\)/g;

export class CommentStalenessAnalyzer implements Analyzer {
  name = 'comment-staleness';
  category = 'comment-staleness' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    const { sourceSymbols } = ctx.codebase;

    if (sourceSymbols.size === 0) return issues;

    const sourceFiles = await fg(
      ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
      { cwd: ctx.projectPath, ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '.git/**', '**/coverage/**', '**/*.d.ts'] },
    );

    for (const file of sourceFiles) {
      try {
        const content = await readFile(join(ctx.projectPath, file), 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Extract comment text
          let commentText: string | null = null;

          const singleMatch = line.match(SINGLE_LINE_COMMENT);
          if (singleMatch) {
            commentText = singleMatch[1];
          } else {
            const multiMatch = line.match(MULTI_LINE_COMMENT_LINE);
            if (multiMatch) {
              commentText = multiMatch[1];
            }
          }

          if (!commentText) continue;

          // Find symbol references like functionName() in the comment
          SYMBOL_REF_REGEX.lastIndex = 0;
          let match;
          while ((match = SYMBOL_REF_REGEX.exec(commentText)) !== null) {
            const symbolName = match[1];

            // Skip common words that happen to look like function calls
            if (['TODO', 'FIXME', 'NOTE', 'HACK', 'XXX', 'WARN', 'INFO', 'DEBUG'].includes(symbolName)) continue;
            if (symbolName.length < 3) continue;

            if (!sourceSymbols.has(symbolName)) {
              issues.push({
                id: issueId('comment-staleness', file, i + 1),
                category: 'comment-staleness',
                severity: ctx.config.severity.staleComment,
                source: { file, line: i + 1, text: line.trim() },
                message: `Comment references \`${symbolName}()\` but that symbol doesn't exist in the codebase`,
                suggestion: 'Function may have been renamed or removed',
              });
            }
          }
        }
      } catch {
        continue;
      }
    }

    return issues;
  }
}
