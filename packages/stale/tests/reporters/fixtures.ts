import { DEFAULT_CONFIG } from '../../src/config.js';
import type { DriftReport } from '../../src/types.js';

export function canonicalReport(): DriftReport {
  return {
    projectPath: '/tmp/project',
    scannedAt: new Date('2024-01-01T00:00:00Z'),
    duration: 42,
    docsScanned: ['README.md'],
    config: DEFAULT_CONFIG,
    issues: [
      {
        id: 'file-path:README.md:10',
        category: 'file-path',
        severity: 'error',
        source: { file: 'README.md', line: 10, text: 'src/db.js' },
        message: 'References `src/db.js` — file does not exist',
        suggestion: 'Update to `src/db.ts`',
        evidence: { expected: 'src/db.js', actual: 'src/db.ts' },
      },
      {
        id: 'command:README.md:20',
        category: 'command',
        severity: 'warning',
        source: { file: 'README.md', line: 20, text: 'npm run dev' },
        message: '`npm run dev` — script "dev" not found in package.json',
        evidence: { expected: 'dev', similarMatches: ['start'] },
      },
      {
        id: 'env-var:README.md:30',
        category: 'env-var',
        severity: 'info',
        source: { file: 'README.md', line: 30, text: 'API_URL' },
        message: 'Env var `API_URL` documented but not used in code',
      },
    ],
    summary: {
      totalChecks: 10,
      errors: 1,
      warnings: 1,
      infos: 1,
      passed: 7,
      byCategory: {
        'file-path': { errors: 1, warnings: 0, passed: 0 },
        'command': { errors: 0, warnings: 1, passed: 0 },
        'env-var': { errors: 0, warnings: 0, passed: 0 },
        'url': { errors: 0, warnings: 0, passed: 0 },
        'version': { errors: 0, warnings: 0, passed: 0 },
        'dependency': { errors: 0, warnings: 0, passed: 0 },
        'api-route': { errors: 0, warnings: 0, passed: 0 },
        'git-staleness': { errors: 0, warnings: 0, passed: 0 },
        'comment-staleness': { errors: 0, warnings: 0, passed: 0 },
      },
    },
  };
}
