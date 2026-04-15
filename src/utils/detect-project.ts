import { execSync } from 'node:child_process';
import { basename } from 'node:path';

/**
 * Auto-detect the current project name.
 * Priority: git remote origin name > directory basename
 */
export function detectProject(): string | null {
  try {
    const remote = execSync('git remote get-url origin', { stdio: 'pipe', encoding: 'utf-8' }).trim();
    const match = remote.match(/\/([^/]+?)(?:\.git)?$/) ?? remote.match(/:([^/]+?)(?:\.git)?$/);
    if (match?.[1]) return match[1];
  } catch {
    // Not a git repo or no remote
  }

  try {
    return basename(process.cwd());
  } catch {
    return null;
  }
}
