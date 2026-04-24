import { writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const SKILL_MD_PATH = join(homedir(), '.claude', 'skills', 'whenlabs', 'SKILL.md');

/** Write the whenlabs SKILL.md file at `filePath`. Creates parent dirs as
 *  needed. Idempotent: re-running overwrites with the same content. */
export function writeSkillFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
}

/** Remove the whenlabs SKILL.md at `filePath`, then remove its parent
 *  directory if it's empty. No-op when the file is already absent. */
export function removeSkillFile(filePath: string): void {
  if (existsSync(filePath)) {
    rmSync(filePath);
  }
  const dir = dirname(filePath);
  if (existsSync(dir) && readdirSync(dir).length === 0) {
    rmSync(dir, { recursive: true });
  }
}
