import type { Reporter, DriftReport, DriftCategory } from '../types.js';

const RULE_MAP: Record<DriftCategory, { id: string; shortDescription: string }> = {
  'command': { id: 'stale/command', shortDescription: 'CLI command drift' },
  'file-path': { id: 'stale/file-path', shortDescription: 'File path drift' },
  'env-var': { id: 'stale/env-var', shortDescription: 'Environment variable drift' },
  'url': { id: 'stale/url', shortDescription: 'URL/link drift' },
  'version': { id: 'stale/version', shortDescription: 'Runtime version drift' },
  'dependency': { id: 'stale/dependency', shortDescription: 'Dependency drift' },
  'api-route': { id: 'stale/api-route', shortDescription: 'API route drift' },
  'semantic': { id: 'stale/semantic', shortDescription: 'Semantic drift' },
  'completeness': { id: 'stale/completeness', shortDescription: 'Documentation completeness' },
  'example': { id: 'stale/example', shortDescription: 'Outdated code examples' },
  'architecture': { id: 'stale/architecture', shortDescription: 'Architecture claims drift' },
  'response-shape': { id: 'stale/response-shape', shortDescription: 'API response shape drift' },
};

function severityToLevel(severity: string): string {
  switch (severity) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    default: return 'note';
  }
}

export class SarifReporter implements Reporter {
  format = 'sarif' as const;

  render(report: DriftReport): string {
    const rules = Object.entries(RULE_MAP).map(([_, rule]) => ({
      id: rule.id,
      shortDescription: { text: rule.shortDescription },
    }));

    const results = report.issues.map((issue) => ({
      ruleId: RULE_MAP[issue.category].id,
      level: severityToLevel(issue.severity),
      message: {
        text: issue.message + (issue.suggestion ? ` (${issue.suggestion})` : ''),
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: issue.source.file },
            region: {
              startLine: issue.source.line,
              ...(issue.source.endLine ? { endLine: issue.source.endLine } : {}),
            },
          },
        },
      ],
    }));

    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
      version: '2.1.0' as const,
      runs: [
        {
          tool: {
            driver: {
              name: 'stale',
              version: '0.1.0',
              informationUri: 'https://github.com/stale-cli/stale',
              rules,
            },
          },
          results,
        },
      ],
    };

    return JSON.stringify(sarif, null, 2);
  }
}
