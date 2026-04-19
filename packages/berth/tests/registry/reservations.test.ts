import { describe, it, expect } from 'vitest';
import type { Registry } from '../../src/types.js';
import {
  activeReservations,
  addReservation,
  findReservation,
  parseExpiry,
  removeReservation,
} from '../../src/registry/reservations.js';

function emptyRegistry(): Registry {
  return { version: 2, projects: {}, reservations: [] };
}

describe('reservations', () => {
  it('addReservation replaces any existing entry for the same port', () => {
    let reg = emptyRegistry();
    reg = addReservation(reg, {
      port: 3000,
      project: 'a',
      createdAt: '2024-01-01T00:00:00Z',
      source: 'manual',
    });
    reg = addReservation(reg, {
      port: 3000,
      project: 'b',
      createdAt: '2024-02-01T00:00:00Z',
      source: 'manual',
    });
    expect(reg.reservations).toHaveLength(1);
    expect(reg.reservations[0].project).toBe('b');
  });

  it('removeReservation is a no-op when no match', () => {
    const reg = emptyRegistry();
    const next = removeReservation(reg, 4000);
    expect(next.reservations).toHaveLength(0);
  });

  it('findReservation ignores expired entries', () => {
    let reg = emptyRegistry();
    reg = addReservation(reg, {
      port: 3000,
      project: 'a',
      createdAt: '2000-01-01T00:00:00Z',
      expiresAt: '2000-01-02T00:00:00Z',
      source: 'manual',
    });
    expect(findReservation(reg, 3000)).toBeUndefined();
    expect(activeReservations(reg)).toHaveLength(0);
  });

  it('activeReservations keeps non-expired entries', () => {
    let reg = emptyRegistry();
    reg = addReservation(reg, {
      port: 3000,
      project: 'a',
      createdAt: '2024-01-01T00:00:00Z',
      expiresAt: '9999-12-31T23:59:59Z',
      source: 'manual',
    });
    expect(activeReservations(reg)).toHaveLength(1);
  });
});

describe('parseExpiry', () => {
  const now = new Date('2024-01-01T00:00:00Z');

  it('parses hours', () => {
    expect(parseExpiry('3h', now)).toBe('2024-01-01T03:00:00.000Z');
  });

  it('parses days', () => {
    expect(parseExpiry('7d', now)).toBe('2024-01-08T00:00:00.000Z');
  });

  it('parses weeks', () => {
    expect(parseExpiry('2w', now)).toBe('2024-01-15T00:00:00.000Z');
  });

  it('rejects invalid strings', () => {
    expect(() => parseExpiry('tomorrow', now)).toThrow(/invalid expiry/);
  });

  it('returns undefined when input is undefined', () => {
    expect(parseExpiry(undefined, now)).toBeUndefined();
  });
});
