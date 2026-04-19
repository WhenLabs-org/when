import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMarkdownFile } from '../../src/parsers/markdown.js';

async function parse(contents: string): Promise<ReturnType<typeof parseMarkdownFile>> {
  const dir = await mkdtemp(join(tmpdir(), 'stale-md-'));
  await writeFile(join(dir, 'README.md'), contents);
  const parsed = parseMarkdownFile('README.md', dir);
  parsed.finally(() => rm(dir, { recursive: true, force: true }));
  return parsed;
}

describe('markdown parser', () => {
  describe('file path extraction', () => {
    it('extracts paths with file extensions', async () => {
      const doc = await parse('See `src/config/database.ts` for details.');
      expect(doc.filePaths.map((p) => p.path)).toContain('src/config/database.ts');
    });

    it('extracts paths with known directory prefixes', async () => {
      const doc = await parse('Look under src/analyzers/ for more.');
      expect(doc.filePaths.map((p) => p.path)).toEqual(
        expect.arrayContaining(['src/analyzers']),
      );
    });

    it('does not extract prose slashes like Travis/CircleCI', async () => {
      const doc = await parse('We support Travis/CircleCI badge detection.');
      expect(doc.filePaths.map((p) => p.path)).not.toContain('Travis/CircleCI');
    });

    it('does not extract prose slashes like Redis/Postgres', async () => {
      const doc = await parse('Lists Redis/Postgres as prerequisites.');
      expect(doc.filePaths.map((p) => p.path)).not.toContain('Redis/Postgres');
    });

    it('does not extract package names like remark/unified', async () => {
      const doc = await parse('Built on remark/unified for markdown parsing.');
      expect(doc.filePaths.map((p) => p.path)).not.toContain('remark/unified');
    });
  });

  describe('env var extraction', () => {
    it('does not flag ES<year> identifiers as env vars', async () => {
      const doc = await parse('TypeScript targets ES2022 by default.');
      expect(doc.envVars.map((v) => v.name)).not.toContain('ES2022');
    });

    it('does not flag other protocol/version identifiers', async () => {
      const doc = await parse('Supports HTTP2 and IE11 legacy mode.');
      const names = doc.envVars.map((v) => v.name);
      expect(names).not.toContain('HTTP2');
      expect(names).not.toContain('IE11');
    });

    it('still extracts genuine env var names', async () => {
      const doc = await parse('Set `DATABASE_URL` and `API_KEY` before starting.');
      const names = doc.envVars.map((v) => v.name);
      expect(names).toEqual(expect.arrayContaining(['DATABASE_URL', 'API_KEY']));
    });
  });
});
