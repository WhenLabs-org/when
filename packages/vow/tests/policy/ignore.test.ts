import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  compilePattern,
  loadIgnoreFile,
  matchesAny,
  parseIgnoreContent,
} from '../../src/policy/ignore.js';

describe('compilePattern', () => {
  it('matches exact names', () => {
    expect(compilePattern('lodash').test('lodash')).toBe(true);
    expect(compilePattern('lodash').test('lodash-es')).toBe(false);
  });

  it('matches * wildcards', () => {
    expect(compilePattern('eslint-*').test('eslint-plugin-react')).toBe(true);
    expect(compilePattern('eslint-*').test('eslint')).toBe(false);
    expect(compilePattern('*-eslint').test('babel-eslint')).toBe(true);
  });

  it('matches scoped wildcards', () => {
    expect(compilePattern('@internal/*').test('@internal/foo')).toBe(true);
    expect(compilePattern('@internal/*').test('@external/foo')).toBe(false);
  });

  it('escapes regex metacharacters', () => {
    const re = compilePattern('pkg.name+tag');
    expect(re.test('pkg.name+tag')).toBe(true);
    expect(re.test('pkgXnameXtag')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(compilePattern('@Scope/Name').test('@scope/name')).toBe(true);
  });
});

describe('parseIgnoreContent', () => {
  it('strips comments and blank lines', () => {
    const input = `# comment
@internal/*

# another
lodash
  eslint-*
`;
    expect(parseIgnoreContent(input)).toEqual(['@internal/*', 'lodash', 'eslint-*']);
  });
});

describe('matchesAny', () => {
  it('returns true if any pattern matches', () => {
    expect(matchesAny('lodash', ['@internal/*', 'lodash'])).toBe(true);
    expect(matchesAny('react', ['@internal/*', 'lodash'])).toBe(false);
  });

  it('returns false for empty pattern list', () => {
    expect(matchesAny('anything', [])).toBe(false);
  });
});

describe('loadIgnoreFile', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'vow-ignore-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns empty array when .vowignore is absent', async () => {
    expect(await loadIgnoreFile(root)).toEqual([]);
  });

  it('reads patterns from .vowignore', async () => {
    await writeFile(
      path.join(root, '.vowignore'),
      '# internal scope\n@internal/*\n\nlodash\n',
      'utf-8',
    );
    expect(await loadIgnoreFile(root)).toEqual(['@internal/*', 'lodash']);
  });
});
