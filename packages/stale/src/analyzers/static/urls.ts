import type { Analyzer, AnalyzerContext, DriftIssue } from '../../types.js';
import { issueId } from '../../utils/id.js';

const CI_MIGRATION_PATTERNS = [
  { urlPattern: 'travis-ci.org', indicator: '.github/workflows', message: 'Travis CI URL but project uses GitHub Actions' },
  { urlPattern: 'travis-ci.com', indicator: '.github/workflows', message: 'Travis CI URL but project uses GitHub Actions' },
  { urlPattern: 'circleci.com', indicator: '.github/workflows', message: 'CircleCI URL but project may use GitHub Actions' },
  { urlPattern: 'appveyor.com', indicator: '.github/workflows', message: 'AppVeyor URL but project may use GitHub Actions' },
];

function hasDirectory(existingFiles: Set<string>, dirPrefix: string): boolean {
  for (const file of existingFiles) {
    if (file.startsWith(dirPrefix)) return true;
  }
  return false;
}

export class UrlsAnalyzer implements Analyzer {
  name = 'urls';
  category = 'url' as const;

  async analyze(ctx: AnalyzerContext): Promise<DriftIssue[]> {
    const issues: DriftIssue[] = [];

    for (const doc of ctx.docs) {
      for (const link of doc.links) {
        // Check CI migration patterns
        for (const pattern of CI_MIGRATION_PATTERNS) {
          if (link.url.includes(pattern.urlPattern)) {
            if (hasDirectory(ctx.codebase.existingFiles, pattern.indicator)) {
              issues.push({
                id: issueId('url', doc.filePath, link.line),
                category: 'url',
                severity: ctx.config.severity.brokenUrl,
                source: { file: doc.filePath, line: link.line, text: link.url },
                message: pattern.message,
                suggestion: `${pattern.indicator}/ directory exists — likely migrated`,
                evidence: { expected: link.url, actual: pattern.indicator },
              });
            }
          }
        }

        // Check relative links
        if (!link.url.startsWith('http://') && !link.url.startsWith('https://') && !link.url.startsWith('#') && !link.url.startsWith('mailto:')) {
          const cleanPath = link.url.split('#')[0].split('?')[0];
          if (cleanPath && !ctx.codebase.existingFiles.has(cleanPath)) {
            issues.push({
              id: issueId('url', doc.filePath, link.line),
              category: 'url',
              severity: ctx.config.severity.brokenUrl,
              source: { file: doc.filePath, line: link.line, text: link.url },
              message: `Relative link \`${link.url}\` — target does not exist`,
              evidence: { expected: cleanPath },
            });
          }
        }

        // External URL checking (when enabled)
        if (
          (link.url.startsWith('http://') || link.url.startsWith('https://')) &&
          typeof ctx.config.checks.urls === 'object' &&
          ctx.config.checks.urls.checkExternal
        ) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(link.url, {
              method: 'HEAD',
              signal: controller.signal,
              redirect: 'follow',
            });
            clearTimeout(timeout);

            if (response.status >= 400) {
              issues.push({
                id: issueId('url', doc.filePath, link.line),
                category: 'url',
                severity: response.status === 404 ? 'error' : 'warning',
                source: { file: doc.filePath, line: link.line, text: link.url },
                message: `External link returned HTTP ${response.status}`,
                evidence: { expected: '2xx', actual: String(response.status) },
              });
            }
          } catch {
            issues.push({
              id: issueId('url', doc.filePath, link.line),
              category: 'url',
              severity: 'warning',
              source: { file: doc.filePath, line: link.line, text: link.url },
              message: `External link \`${link.url}\` — could not verify (timeout or error)`,
            });
          }
        }
      }
    }

    return issues;
  }
}
