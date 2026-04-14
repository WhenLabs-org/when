import { simpleGit } from 'simple-git';
import type { GitInfo } from '../types.js';

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
