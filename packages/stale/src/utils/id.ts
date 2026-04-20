import type { DriftCategory } from '../types.js';

const CATEGORY_PREFIX: Record<DriftCategory, string> = {
  'command': 'cmd',
  'file-path': 'path',
  'env-var': 'env',
  'url': 'url',
  'version': 'ver',
  'dependency': 'dep',
  'api-route': 'api',
  'git-staleness': 'git',
  'comment-staleness': 'cmt',
};

const idCounts = new Map<string, number>();

export function issueId(category: DriftCategory, file: string, line: number): string {
  const prefix = CATEGORY_PREFIX[category];
  const fileName = file.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
  const baseId = `${prefix}-${fileName}-${line}`;
  const count = (idCounts.get(baseId) ?? 0) + 1;
  idCounts.set(baseId, count);
  return count === 1 ? baseId : `${baseId}-${count}`;
}
