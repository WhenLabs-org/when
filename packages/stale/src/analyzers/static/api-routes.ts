import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { findSimilar } from '../../utils/similarity.js';
import { issueId } from '../../utils/id.js';

function normalizePath(path: string): string {
  return path
    .replace(/\/+$/, '')           // strip trailing slash
    .replace(/:(\w+)/g, '{$1}')   // :id -> {id}
    .toLowerCase();
}

export class ApiRoutesAnalyzer implements Analyzer {
  name = 'api-routes';
  category = 'api-route' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];
    const codeRoutes = ctx.codebase.routes;

    if (codeRoutes.length === 0) return issues;

    const codeRouteKeys = codeRoutes.map((r) => `${r.method} ${normalizePath(r.path)}`);
    const codePathSet = new Set(codeRoutes.map((r) => normalizePath(r.path)));

    for (const doc of ctx.docs) {
      for (const endpoint of doc.apiEndpoints) {
        const normalizedDocPath = normalizePath(endpoint.path);
        const docKey = `${endpoint.method} ${normalizedDocPath}`;

        // Exact match (method + path)
        if (codeRouteKeys.includes(docKey)) continue;

        // Path exists but method differs
        const matchingPath = codeRoutes.find((r) => normalizePath(r.path) === normalizedDocPath);
        if (matchingPath) {
          issues.push({
            id: issueId('api-route', doc.filePath, endpoint.line),
            category: 'api-route',
            severity: ctx.config.severity.routeMismatch,
            source: { file: doc.filePath, line: endpoint.line, text: `${endpoint.method} ${endpoint.path}` },
            message: `Documents \`${endpoint.method} ${endpoint.path}\` but code has \`${matchingPath.method} ${matchingPath.path}\``,
            evidence: {
              expected: `${endpoint.method} ${endpoint.path}`,
              actual: `${matchingPath.method} ${matchingPath.path}`,
              codeLocations: [{ file: matchingPath.file, line: matchingPath.line }],
            },
          });
          continue;
        }

        // Path not found — fuzzy match
        const codePaths = codeRoutes.map((r) => normalizePath(r.path));
        const similar = findSimilar(normalizedDocPath, codePaths, 0.5);

        issues.push({
          id: issueId('api-route', doc.filePath, endpoint.line),
          category: 'api-route',
          severity: ctx.config.severity.routeMismatch,
          source: { file: doc.filePath, line: endpoint.line, text: `${endpoint.method} ${endpoint.path}` },
          message: `Documents \`${endpoint.method} ${endpoint.path}\` — route not found in codebase`,
          suggestion: similar.length > 0 ? `Similar routes: ${similar.slice(0, 3).join(', ')}` : undefined,
          evidence: { expected: endpoint.path, similarMatches: similar.slice(0, 3) },
        });
      }
    }

    return issues;
  }
}
