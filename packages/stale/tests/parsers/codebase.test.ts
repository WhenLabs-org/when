import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCodebase } from '../../src/parsers/codebase.js';
import { DEFAULT_CONFIG } from '../../src/config.js';

describe('parseCodebase', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stale-codebase-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('Python env var extraction', () => {
    it('catches os.environ bracket access and dotted variants', async () => {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src/app.py'), [
        `import os`,
        `key = os.environ["DB_URL"]`,
        `secret = os.environ.get("API_KEY")`,
        `port = os.getenv("PORT", "8000")`,
      ].join('\n'));
      const facts = await parseCodebase(dir, DEFAULT_CONFIG);
      const names = facts.envVarsUsed.map((e) => e.name).sort();
      expect(names).toEqual(['API_KEY', 'DB_URL', 'PORT']);
    });

    it('catches bare `environ["..."]` after `from os import environ`', async () => {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src/app.py'), [
        `from os import environ, getenv`,
        `host = environ["REDIS_HOST"]`,
        `debug = getenv("DEBUG_MODE")`,
      ].join('\n'));
      const facts = await parseCodebase(dir, DEFAULT_CONFIG);
      const names = facts.envVarsUsed.map((e) => e.name).sort();
      expect(names).toEqual(['DEBUG_MODE', 'REDIS_HOST']);
    });

    it('does not extract env var names from Python comments', async () => {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src/app.py'), [
        `# old: os.getenv("REMOVED_VAR")`,
        `key = os.getenv("KEPT_VAR")`,
      ].join('\n'));
      const facts = await parseCodebase(dir, DEFAULT_CONFIG);
      const names = facts.envVarsUsed.map((e) => e.name);
      expect(names).toContain('KEPT_VAR');
      expect(names).not.toContain('REMOVED_VAR');
    });
  });

  it('respects config.ignore during source extraction', async () => {
    await mkdir(join(dir, 'src'), { recursive: true });
    await mkdir(join(dir, 'tests/fixtures/sample'), { recursive: true });
    await writeFile(join(dir, 'src/app.ts'), `const key = process.env.REAL_KEY;`);
    await writeFile(join(dir, 'tests/fixtures/sample/bad.ts'), `const k = process.env.FIXTURE_ONLY;`);

    const noIgnore = await parseCodebase(dir, DEFAULT_CONFIG);
    expect(noIgnore.envVarsUsed.map((e) => e.name).sort()).toEqual(['FIXTURE_ONLY', 'REAL_KEY']);

    const withIgnore = await parseCodebase(dir, {
      ...DEFAULT_CONFIG,
      ignore: [...DEFAULT_CONFIG.ignore, 'tests/fixtures/**'],
    });
    expect(withIgnore.envVarsUsed.map((e) => e.name)).toEqual(['REAL_KEY']);
  });
});
