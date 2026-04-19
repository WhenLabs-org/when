import { simpleGit } from 'simple-git';
import type { GitInfo } from '../types.js';

export interface RenameInfo {
  from: string;
  to: string;
  commit: string;
  score: number;
}

export async function getFileLastModified(filePath: string, projectPath: string): Promise<GitInfo | null> {
  try {
    const git = simpleGit(projectPath);
    const log = await git.log({ file: filePath, maxCount: 1 });
    if (!log.latest) return null;
    return {
      lastModified: new Date(log.latest.date),
      lastModifiedBy: log.latest.author_name,
      commitHash: log.latest.hash,
    };
  } catch {
    return null;
  }
}

export async function findRemovalCommit(searchTerm: string, projectPath: string): Promise<string | null> {
  try {
    const git = simpleGit(projectPath);
    const log = await git.log(['-S', searchTerm, '--all', '--max-count=1']);
    return log.latest?.hash ?? null;
  } catch {
    return null;
  }
}

export async function findRenameTarget(
  missingPath: string,
  projectPath: string,
  existingFiles: Set<string>,
): Promise<RenameInfo | null> {
  try {
    const git = simpleGit(projectPath);
    const normalized = missingPath.replace(/^\.\//, '');
    const raw = await git.raw([
      'log', '--all', '--follow', '--diff-filter=R',
      '--name-status', '--format=%H', '--find-renames=50%',
      '--max-count=20', '--', normalized,
    ]);
    if (!raw.trim()) return null;

    const lines = raw.split('\n');
    let currentCommit = '';
    for (const line of lines) {
      if (/^[0-9a-f]{40}$/.test(line.trim())) {
        currentCommit = line.trim();
        continue;
      }
      const m = line.match(/^R(\d+)\t(.+?)\t(.+)$/);
      if (!m) continue;
      const score = parseInt(m[1], 10);
      const from = m[2];
      const to = m[3];
      if (from !== normalized) continue;
      if (existingFiles.has(to)) {
        return { from, to, commit: currentCommit, score };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getBlame(filePath: string, line: number, projectPath: string): Promise<GitInfo | null> {
  try {
    const git = simpleGit(projectPath);
    const result = await git.raw(['blame', '-L', `${line},${line}`, '--porcelain', filePath]);
    const hashMatch = result.match(/^([0-9a-f]{40})/);
    const authorMatch = result.match(/^author (.+)$/m);
    const timeMatch = result.match(/^author-time (\d+)$/m);
    if (!hashMatch) return null;
    return {
      commitHash: hashMatch[1],
      lastModifiedBy: authorMatch?.[1],
      lastModified: timeMatch ? new Date(parseInt(timeMatch[1], 10) * 1000) : undefined,
    };
  } catch {
    return null;
  }
}
