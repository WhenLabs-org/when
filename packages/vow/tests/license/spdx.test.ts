import { describe, it, expect } from 'vitest';
import { parseSpdxExpression, extractLicenseIds, isSpdxExpression, satisfies } from '../../src/license/spdx.js';

describe('isSpdxExpression', () => {
  it('returns true for MIT', () => {
    expect(isSpdxExpression('MIT')).toBe(true);
  });

  it('returns true for compound expression', () => {
    expect(isSpdxExpression('(MIT OR Apache-2.0)')).toBe(true);
  });

  it('returns false for SEE LICENSE IN', () => {
    expect(isSpdxExpression('SEE LICENSE IN LICENSE.md')).toBe(false);
  });

  it('returns false for URLs', () => {
    expect(isSpdxExpression('https://example.com/license')).toBe(false);
  });

  it('returns false for UNLICENSED', () => {
    expect(isSpdxExpression('UNLICENSED')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSpdxExpression('')).toBe(false);
  });
});

describe('parseSpdxExpression', () => {
  it('parses simple expression', () => {
    const result = parseSpdxExpression('MIT');
    expect(result).not.toBeNull();
    expect(result!.licenses).toEqual(['MIT']);
    expect(result!.isCompound).toBe(false);
  });

  it('parses OR expression', () => {
    const result = parseSpdxExpression('(MIT OR Apache-2.0)');
    expect(result).not.toBeNull();
    expect(result!.licenses).toContain('MIT');
    expect(result!.licenses).toContain('Apache-2.0');
    expect(result!.isCompound).toBe(true);
  });

  it('parses AND expression', () => {
    const result = parseSpdxExpression('(MIT AND CC-BY-3.0)');
    expect(result).not.toBeNull();
    expect(result!.licenses).toContain('MIT');
    expect(result!.licenses).toContain('CC-BY-3.0');
    expect(result!.isCompound).toBe(true);
  });

  it('returns null for invalid expression', () => {
    expect(parseSpdxExpression('NOT-A-LICENSE-??')).toBeNull();
  });
});

describe('extractLicenseIds', () => {
  it('extracts single ID', () => {
    expect(extractLicenseIds('MIT')).toEqual(['MIT']);
  });

  it('extracts from OR expression', () => {
    const ids = extractLicenseIds('(MIT OR Apache-2.0)');
    expect(ids).toContain('MIT');
    expect(ids).toContain('Apache-2.0');
  });

  it('extracts from complex expression', () => {
    const ids = extractLicenseIds('(MIT OR Apache-2.0) AND BSD-3-Clause');
    expect(ids).toContain('MIT');
    expect(ids).toContain('Apache-2.0');
    expect(ids).toContain('BSD-3-Clause');
  });
});

describe('satisfies', () => {
  it('returns true when license is in allowed list', () => {
    expect(satisfies('MIT', ['MIT', 'Apache-2.0'])).toBe(true);
  });

  it('returns false when license is not in allowed list', () => {
    expect(satisfies('GPL-3.0-only', ['MIT', 'Apache-2.0'])).toBe(false);
  });

  it('handles OR expression — satisfied if any branch matches', () => {
    expect(satisfies('(MIT OR GPL-3.0-only)', ['MIT'])).toBe(true);
  });

  it('handles AND expression — needs all branches', () => {
    expect(satisfies('(MIT AND CC-BY-3.0)', ['MIT'])).toBe(false);
    expect(satisfies('(MIT AND CC-BY-3.0)', ['MIT', 'CC-BY-3.0'])).toBe(true);
  });
});
