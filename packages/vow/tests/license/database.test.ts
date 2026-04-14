import { describe, it, expect } from 'vitest';
import { normalizeLicenseId, isValidSpdxId, getLicenseById } from '../../src/license/database.js';

describe('normalizeLicenseId', () => {
  it('normalizes MIT License to MIT', () => {
    expect(normalizeLicenseId('MIT License')).toBe('MIT');
  });

  it('normalizes Apache 2.0 to Apache-2.0', () => {
    expect(normalizeLicenseId('Apache 2.0')).toBe('Apache-2.0');
  });

  it('handles case-insensitive match', () => {
    expect(normalizeLicenseId('mit')).toBe('MIT');
    expect(normalizeLicenseId('APACHE-2.0')).toBe('Apache-2.0');
  });

  it('normalizes BSD to BSD-2-Clause', () => {
    expect(normalizeLicenseId('BSD')).toBe('BSD-2-Clause');
  });

  it('normalizes GPLv3 to GPL-3.0-only', () => {
    expect(normalizeLicenseId('GPLv3')).toBe('GPL-3.0-only');
  });

  it('returns null for unrecognizable input', () => {
    expect(normalizeLicenseId('Some Custom License')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(normalizeLicenseId('')).toBeNull();
  });
});

describe('isValidSpdxId', () => {
  it('returns true for MIT', () => {
    expect(isValidSpdxId('MIT')).toBe(true);
  });

  it('returns true for Apache-2.0', () => {
    expect(isValidSpdxId('Apache-2.0')).toBe(true);
  });

  it('handles case-insensitive', () => {
    expect(isValidSpdxId('mit')).toBe(true);
  });

  it('returns false for invalid ID', () => {
    expect(isValidSpdxId('NotALicense')).toBe(false);
  });
});

describe('getLicenseById', () => {
  it('returns entry for MIT', () => {
    const entry = getLicenseById('MIT');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('MIT');
    expect(entry!.isOsiApproved).toBe(true);
  });

  it('returns undefined for unknown', () => {
    expect(getLicenseById('NotALicense')).toBeUndefined();
  });
});
