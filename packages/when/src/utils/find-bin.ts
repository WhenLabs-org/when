import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function findBin(name: string): string {
  // __dirname is dist/utils/, go up two levels to package root
  const pkgRoot = resolve(__dirname, '../..');

  // 1. Check node_modules/.bin symlink (normal case)
  const localBin = resolve(pkgRoot, 'node_modules', '.bin', name);
  if (existsSync(localBin)) return localBin;

  // 2. Check @whenlabs/<name>/dist/cli.js directly (handles missing/wrong symlinks)
  const directCli = resolve(pkgRoot, 'node_modules', '@whenlabs', name, 'dist', 'cli.js');
  if (existsSync(directCli)) return directCli;

  // 3. Fallback to global PATH
  return name;
}
