import { describe, it, expect } from 'vitest';
import { formatVowError, VowError, VOW_ERRORS } from '../src/errors.js';

describe('VowError', () => {
  it('uses the catalog message and exit code for its code', () => {
    const err = new VowError('VOW-E2001');
    expect(err.code).toBe('VOW-E2001');
    expect(err.exitCode).toBe(2);
    expect(err.message).toBe(VOW_ERRORS['VOW-E2001'].message);
    expect(err.name).toBe('VowError');
  });

  it('appends details to the message', () => {
    const err = new VowError('VOW-E2003', '/tmp/missing/.vow.yml');
    expect(err.message).toContain('/tmp/missing/.vow.yml');
    expect(err.details).toBe('/tmp/missing/.vow.yml');
  });

  it('is instanceof Error for catch blocks', () => {
    try {
      throw new VowError('VOW-E2201', 'bogus');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(VowError);
    }
  });

  it('domain-failure codes use exit 1, operational codes use exit 2', () => {
    expect(new VowError('VOW-E1001').exitCode).toBe(1);
    expect(new VowError('VOW-E1002').exitCode).toBe(1);
    expect(new VowError('VOW-E2001').exitCode).toBe(2);
    expect(new VowError('VOW-E2005').exitCode).toBe(2);
  });
});

describe('formatVowError', () => {
  it('prints code + message on one line', () => {
    const out = formatVowError(new VowError('VOW-E2001'));
    expect(out).toMatch(/^vow: VOW-E2001 /);
    expect(out).toContain(VOW_ERRORS['VOW-E2001'].message);
  });

  it('appends details on a separate indented line', () => {
    const out = formatVowError(new VowError('VOW-E2003', 'foo.yml'));
    const lines = out.split('\n');
    expect(lines[0]).toContain('VOW-E2003');
    expect(lines[1]).toContain('foo.yml');
    expect(lines[1]!.startsWith('  ')).toBe(true);
  });
});

describe('VOW_ERRORS catalog', () => {
  it('every code has a message and exit code of 1 or 2', () => {
    for (const [code, spec] of Object.entries(VOW_ERRORS)) {
      expect(code).toMatch(/^VOW-E\d{4}$/);
      expect(typeof spec.message).toBe('string');
      expect(spec.message.length).toBeGreaterThan(0);
      expect([1, 2]).toContain(spec.exitCode);
    }
  });

  it('codes are unique', () => {
    const codes = Object.keys(VOW_ERRORS);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
