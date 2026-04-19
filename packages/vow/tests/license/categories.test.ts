import { describe, it, expect } from 'vitest';
import { getLicenseCategory, isPermissive, isCopyleft, isStronglyCopyleft } from '../../src/license/categories.js';

describe('getLicenseCategory', () => {
  it('classifies MIT as permissive', () => {
    expect(getLicenseCategory('MIT')).toBe('permissive');
  });

  it('classifies Apache-2.0 as permissive', () => {
    expect(getLicenseCategory('Apache-2.0')).toBe('permissive');
  });

  it('classifies GPL-3.0-only as strongly-copyleft', () => {
    expect(getLicenseCategory('GPL-3.0-only')).toBe('strongly-copyleft');
  });

  it('classifies AGPL-3.0-only as network-copyleft', () => {
    expect(getLicenseCategory('AGPL-3.0-only')).toBe('network-copyleft');
  });

  it('classifies LGPL-2.1-only as weakly-copyleft', () => {
    expect(getLicenseCategory('LGPL-2.1-only')).toBe('weakly-copyleft');
  });

  it('classifies MPL-2.0 as weakly-copyleft', () => {
    expect(getLicenseCategory('MPL-2.0')).toBe('weakly-copyleft');
  });

  it('classifies UNLICENSED as proprietary', () => {
    expect(getLicenseCategory('UNLICENSED')).toBe('proprietary');
  });

  it('returns unknown for unrecognized license', () => {
    expect(getLicenseCategory('SomeRandomLicense')).toBe('unknown');
  });

  it('uses heuristic fallback for GPL variants', () => {
    expect(getLicenseCategory('GPL-2.0-with-classpath-exception')).toBe('strongly-copyleft');
  });
});

describe('isPermissive', () => {
  it('returns true for MIT', () => {
    expect(isPermissive('MIT')).toBe(true);
  });

  it('returns false for GPL', () => {
    expect(isPermissive('GPL-3.0-only')).toBe(false);
  });
});

describe('isCopyleft', () => {
  it('returns true for GPL', () => {
    expect(isCopyleft('GPL-3.0-only')).toBe(true);
  });

  it('returns true for LGPL', () => {
    expect(isCopyleft('LGPL-2.1-only')).toBe(true);
  });

  it('returns true for AGPL', () => {
    expect(isCopyleft('AGPL-3.0-only')).toBe(true);
  });

  it('returns false for MIT', () => {
    expect(isCopyleft('MIT')).toBe(false);
  });
});

describe('isStronglyCopyleft', () => {
  it('returns true for GPL', () => {
    expect(isStronglyCopyleft('GPL-3.0-only')).toBe(true);
  });

  it('returns true for AGPL', () => {
    expect(isStronglyCopyleft('AGPL-3.0-only')).toBe(true);
  });

  it('returns false for LGPL', () => {
    expect(isStronglyCopyleft('LGPL-2.1-only')).toBe(false);
  });
});
