import { distance } from 'fastest-levenshtein';

export function findSimilar(target: string, candidates: string[], threshold = 0.4): string[] {
  if (candidates.length === 0) return [];

  const scored = candidates
    .map((candidate) => {
      const maxLen = Math.max(target.length, candidate.length);
      if (maxLen === 0) return { candidate, score: 1 };
      const score = 1 - distance(target, candidate) / maxLen;
      return { candidate, score };
    })
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score);

  return scored.map(({ candidate }) => candidate);
}

export function isPathLike(s: string): boolean {
  if (s.startsWith('http://') || s.startsWith('https://')) return false;
  if (s.includes('/') && /\.\w+$/.test(s)) return true;
  if (s.startsWith('./') || s.startsWith('../') || s.startsWith('src/') || s.startsWith('lib/')) return true;
  return false;
}

export function normalizePathSeparators(p: string): string {
  return p.replace(/\\/g, '/');
}
