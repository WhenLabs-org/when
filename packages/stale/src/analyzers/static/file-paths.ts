import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { findSimilar } from '../../utils/similarity.js';
import { issueId } from '../../utils/id.js';
import { findRenameTarget } from '../../utils/git.js';
import { resolveFileForDoc, workspaceForDoc } from '../../utils/workspace-scope.js';

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
    const renameCache = new Map<string, Awaited<ReturnType<typeof findRenameTarget>>>();

    for (const doc of ctx.docs) {
      for (const ref of doc.filePaths) {
        const normalizedPath = ref.path.replace(/^\.\//, '');

        // Try root-scoped, then workspace-scoped resolution
        const resolved = resolveFileForDoc(doc.filePath, ref.path, ctx.codebase.existingFiles, ctx.codebase.workspaces);
        if (resolved) continue;

        // Check known alternatives (both root-scoped and workspace-scoped)
        const ws = workspaceForDoc(doc.filePath, ctx.codebase.workspaces);
        const altCandidates = generateAlternatives(normalizedPath);
        if (ws) {
          const prefix = ws.relativePath.endsWith('/') ? ws.relativePath : ws.relativePath + '/';
          for (const a of generateAlternatives(normalizedPath)) altCandidates.push(prefix + a);
        }
        const foundAlt = altCandidates.find((a) => ctx.codebase.existingFiles.has(a));

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

        // Look for git rename history — strongest signal
        let rename = renameCache.get(normalizedPath);
        if (rename === undefined) {
          rename = await findRenameTarget(normalizedPath, ctx.projectPath, ctx.codebase.existingFiles);
          renameCache.set(normalizedPath, rename);
        }
        if (rename) {
          issues.push({
            id: issueId('file-path', doc.filePath, ref.line),
            category: 'file-path',
            severity: ctx.config.severity.missingFile,
            source: { file: doc.filePath, line: ref.line, text: ref.path },
            message: `References \`${ref.path}\` — renamed to \`${rename.to}\` in ${rename.commit.slice(0, 7)}`,
            suggestion: `Update to \`${rename.to}\``,
            evidence: { expected: ref.path, actual: rename.to },
            gitInfo: { commitHash: rename.commit },
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
