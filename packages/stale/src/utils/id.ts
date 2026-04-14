import type { DriftCategory } from '../types.js';

const CATEGORY_PREFIX: Record<DriftCategory, string> = {
  'command': 'cmd',
  'file-path': 'path',
  'env-var': 'env',
  'url': 'url',
  'version': 'ver',
  'dependency': 'dep',
  'api-route': 'api',
  'semantic': 'sem',
  'completeness': 'cmp',
  'example': 'ex',
  'architecture': 'arch',
  'response-shape': 'resp',
};

export function issueId(category: DriftCategory, file: string, line: number): string {
  const prefix = CATEGORY_PREFIX[category];
  const fileName = file.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
  return `${prefix}-${fileName}-${line}`;
}
