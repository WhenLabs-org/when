import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { findSimilar } from '../../utils/similarity.js';
import { issueId } from '../../utils/id.js';

const EXTENSION_TRANSFORMS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.mjs', '.cjs'],
  '.ts': ['.js', '.tsx', '.mjs'],
  '.jsx': ['.tsx', '.js'],
  '.tsx': ['.jsx', '.ts'],
  '.yml': ['.yaml'],
  '.yaml': ['.yml'],
};

const NAME_TRANSFORMS: Record<string, string[]> = {
  'docker-compose.yml': ['docker-compose.yaml', 'compose.yml', 'compose.yaml'],
  'docker-compose.yaml': ['docker-compose.yml', 'compose.yml', 'compose.yaml'],
  'compose.yml': ['compose.yaml', 'docker-compose.yml', 'docker-compose.yaml'],
};

function generateAlternatives(path: string): string[] {
  const alternatives: string[] = [];

  // Check name transforms
  const baseName = path.split('/').pop() ?? '';
  if (baseName in NAME_TRANSFORMS) {
    const dir = path.slice(0, path.length - baseName.length);
    for (const alt of NAME_TRANSFORMS[baseName]) {
      alternatives.push(dir + alt);
    }
  }

  // Check extension transforms
  const ext = '.' + (path.split('.').pop() ?? '');
  if (ext in EXTENSION_TRANSFORMS) {
    const base = path.slice(0, path.length - ext.length);
    for (const altExt of EXTENSION_TRANSFORMS[ext]) {
      alternatives.push(base + altExt);
    }
  }

  return alternatives;
}

export class FilePathsAnalyzer implements Analyzer {
  name = 'file-paths';
  category = 'file-path' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    const files = Array.from(ctx.codebase.existingFiles);

    for (const doc of ctx.docs) {
      for (const ref of doc.filePaths) {
        const normalizedPath = ref.path.replace(/^\.\//, '');

        if (ctx.codebase.existingFiles.has(normalizedPath)) continue;

        // Check known alternatives
        const alternatives = generateAlternatives(normalizedPath);
        const foundAlt = alternatives.find((a) => ctx.codebase.existingFiles.has(a));

        if (foundAlt) {
          issues.push({
            id: issueId('file-path', doc.filePath, ref.line),
            category: 'file-path',
            severity: ctx.config.severity.missingFile,
            source: { file: doc.filePath, line: ref.line, text: ref.path },
            message: `References \`${ref.path}\` — file does not exist`,
            suggestion: `Similar: \`${foundAlt}\` (renamed?)`,
            evidence: { expected: ref.path, actual: foundAlt },
          });
          continue;
        }

        // Fuzzy match
        const similar = findSimilar(normalizedPath, files, 0.5);
        if (similar.length > 0) {
          issues.push({
            id: issueId('file-path', doc.filePath, ref.line),
            category: 'file-path',
            severity: ctx.config.severity.missingFile,
            source: { file: doc.filePath, line: ref.line, text: ref.path },
            message: `References \`${ref.path}\` — file does not exist`,
            suggestion: `Similar: ${similar.slice(0, 3).map((s) => `\`${s}\``).join(', ')}`,
            evidence: { expected: ref.path, similarMatches: similar.slice(0, 3) },
          });
        } else {
          issues.push({
            id: issueId('file-path', doc.filePath, ref.line),
            category: 'file-path',
            severity: ctx.config.severity.missingFile,
            source: { file: doc.filePath, line: ref.line, text: ref.path },
            message: `References \`${ref.path}\` — file does not exist`,
            evidence: { expected: ref.path },
          });
        }
      }
    }

    return issues;
  }
}
