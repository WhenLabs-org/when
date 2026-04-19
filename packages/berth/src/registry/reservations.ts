import type { Registry, Reservation } from '../types.js';

export function findReservation(registry: Registry, port: number): Reservation | undefined {
  const active = activeReservations(registry);
  return active.find((r) => r.port === port);
}

export function activeReservations(registry: Registry, now = new Date()): Reservation[] {
  const nowIso = now.toISOString();
  return registry.reservations.filter((r) => !r.expiresAt || r.expiresAt > nowIso);
}

export function addReservation(registry: Registry, reservation: Reservation): Registry {
  const others = registry.reservations.filter((r) => r.port !== reservation.port);
  return { ...registry, reservations: [...others, reservation] };
}

export function removeReservation(registry: Registry, port: number): Registry {
  return {
    ...registry,
    reservations: registry.reservations.filter((r) => r.port !== port),
  };
}

/**
 * Parse a duration like "7d", "3h", "30m" into a future ISO timestamp.
 * Returns undefined if the input is falsy.
 */
export function parseExpiry(input: string | undefined, now = new Date()): string | undefined {
  if (!input) return undefined;
  const match = input.match(/^(\d+)([smhdw])$/);
  if (!match) {
    throw new Error(`invalid expiry "${input}" — expected e.g. 7d, 3h, 30m, 2w`);
  }
  const n = parseInt(match[1], 10);
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };
  const ms = n * unitMs[match[2]];
  return new Date(now.getTime() + ms).toISOString();
}
