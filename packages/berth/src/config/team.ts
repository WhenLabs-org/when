import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import type {
  Conflict,
  ConfiguredPort,
  LoadedTeamConfig,
  Reservation,
  TeamAssignment,
  TeamConfig,
  TeamForbidden,
  TeamReservedRange,
} from '../types.js';
import { isValidPort } from '../utils/ports.js';

export class TeamConfigError extends Error {
  constructor(message: string, public readonly filePath?: string) {
    super(message);
    this.name = 'TeamConfigError';
  }
}

function fail(p: string, msg: string, filePath?: string): never {
  throw new TeamConfigError(`${p}: ${msg}`, filePath);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateTeamConfig(raw: unknown, filePath?: string): TeamConfig {
  if (!isPlainObject(raw)) throw new TeamConfigError('team config must be an object', filePath);
  if (raw.version !== 1) fail('version', 'only 1 is supported', filePath);

  if (!Array.isArray(raw.assignments)) fail('assignments', 'must be an array', filePath);
  const assignments: TeamAssignment[] = [];
  const seenPorts = new Set<number>();
  for (const [i, a] of (raw.assignments as unknown[]).entries()) {
    if (!isPlainObject(a)) fail(`assignments[${i}]`, 'must be an object', filePath);
    if (typeof a.port !== 'number' || !isValidPort(a.port)) {
      fail(`assignments[${i}].port`, 'must be a valid port', filePath);
    }
    if (typeof a.project !== 'string' || !a.project) {
      fail(`assignments[${i}].project`, 'must be a non-empty string', filePath);
    }
    if (seenPorts.has(a.port)) {
      fail(`assignments[${i}].port`, `duplicate assignment for port ${a.port}`, filePath);
    }
    seenPorts.add(a.port);
    const entry: TeamAssignment = { port: a.port, project: a.project };
    if (a.role !== undefined) {
      if (typeof a.role !== 'string') fail(`assignments[${i}].role`, 'must be string', filePath);
      entry.role = a.role;
    }
    if (a.owner !== undefined) {
      if (typeof a.owner !== 'string') fail(`assignments[${i}].owner`, 'must be string', filePath);
      entry.owner = a.owner;
    }
    assignments.push(entry);
  }

  const result: TeamConfig = { version: 1, assignments };

  if (raw.reservedRanges !== undefined) {
    if (!Array.isArray(raw.reservedRanges)) fail('reservedRanges', 'must be an array', filePath);
    const ranges: TeamReservedRange[] = [];
    for (const [i, r] of (raw.reservedRanges as unknown[]).entries()) {
      if (!isPlainObject(r)) fail(`reservedRanges[${i}]`, 'must be an object', filePath);
      if (typeof r.from !== 'number' || !isValidPort(r.from)) {
        fail(`reservedRanges[${i}].from`, 'must be a valid port', filePath);
      }
      if (typeof r.to !== 'number' || !isValidPort(r.to)) {
        fail(`reservedRanges[${i}].to`, 'must be a valid port', filePath);
      }
      if (r.from > r.to) fail(`reservedRanges[${i}]`, 'from must be <= to', filePath);
      if (typeof r.purpose !== 'string' || !r.purpose) {
        fail(`reservedRanges[${i}].purpose`, 'must be a non-empty string', filePath);
      }
      ranges.push({ from: r.from, to: r.to, purpose: r.purpose });
    }
    result.reservedRanges = ranges;
  }

  if (raw.forbidden !== undefined) {
    if (!Array.isArray(raw.forbidden)) fail('forbidden', 'must be an array', filePath);
    const forbidden: TeamForbidden[] = [];
    for (const [i, f] of (raw.forbidden as unknown[]).entries()) {
      if (!isPlainObject(f)) fail(`forbidden[${i}]`, 'must be an object', filePath);
      if (typeof f.port !== 'number' || !isValidPort(f.port)) {
        fail(`forbidden[${i}].port`, 'must be a valid port', filePath);
      }
      if (typeof f.reason !== 'string' || !f.reason) {
        fail(`forbidden[${i}].reason`, 'must be a non-empty string', filePath);
      }
      forbidden.push({ port: f.port, reason: f.reason });
    }
    result.forbidden = forbidden;
  }

  if (raw.policies !== undefined) {
    if (!isPlainObject(raw.policies)) fail('policies', 'must be an object', filePath);
    const pol = raw.policies;
    const policies: NonNullable<TeamConfig['policies']> = {};
    if (pol.killBlockingProcesses !== undefined) {
      if (!['never', 'devOnly', 'always'].includes(pol.killBlockingProcesses as string)) {
        fail('policies.killBlockingProcesses', 'must be never|devOnly|always', filePath);
      }
      policies.killBlockingProcesses = pol.killBlockingProcesses as
        | 'never'
        | 'devOnly'
        | 'always';
    }
    if (pol.onConflict !== undefined) {
      if (!['warn', 'error'].includes(pol.onConflict as string)) {
        fail('policies.onConflict', 'must be warn|error', filePath);
      }
      policies.onConflict = pol.onConflict as 'warn' | 'error';
    }
    result.policies = policies;
  }

  return result;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function findTeamConfig(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  const { root } = path.parse(dir);
  while (true) {
    const candidate = path.join(dir, '.berth', 'team.json');
    if (await exists(candidate)) return candidate;
    if (await exists(path.join(dir, '.git'))) return null;
    const parent = path.dirname(dir);
    if (parent === dir || parent === root) return null;
    dir = parent;
  }
}

export async function loadTeamConfig(startDir: string): Promise<LoadedTeamConfig | null> {
  const filePath = await findTeamConfig(startDir);
  if (!filePath) return null;

  const content = await fs.readFile(filePath, 'utf-8');
  const errors: import('jsonc-parser').ParseError[] = [];
  const parsed = parseJsonc(content, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new TeamConfigError(
      `failed to parse ${filePath}: ${errors.map((e) => e.error).join(', ')}`,
      filePath,
    );
  }
  const config = validateTeamConfig(parsed, filePath);
  return { config, filePath };
}

/**
 * Convert team config into reservations that can flow through conflict
 * detection. Assignments become single-port reservations; ranges and
 * forbidden entries expand into reservations owned by "_team_" so conflicts
 * are surfaced with the team's reason.
 */
export function teamReservations(config: TeamConfig): Reservation[] {
  const createdAt = new Date(0).toISOString(); // stable — not user-authored
  const out: Reservation[] = [];

  for (const a of config.assignments) {
    out.push({
      port: a.port,
      project: a.project,
      reason: a.role,
      createdAt,
      source: 'team',
    });
  }
  // Ranges are handled separately via detectRangeViolations so we don't
  // materialise each port.
  void config.reservedRanges;
  for (const f of config.forbidden ?? []) {
    out.push({
      port: f.port,
      project: '_team_forbidden_',
      reason: f.reason,
      createdAt,
      source: 'team',
    });
  }

  return out;
}

/**
 * Emit Conflict entries for any configured port that falls inside a team
 * reserved range but is not owned by the team policy. Same severity as
 * cross-project conflicts — warning, not error.
 */
export function detectRangeViolations(
  configured: ConfiguredPort[],
  ranges: TeamReservedRange[] | undefined,
  assignments: TeamAssignment[],
): Conflict[] {
  if (!ranges || ranges.length === 0) return [];
  const assignmentByPort = new Map(assignments.map((a) => [a.port, a]));
  const out: Conflict[] = [];
  const seen = new Set<number>();
  for (const p of configured) {
    if (seen.has(p.port)) continue;
    const matchedRange = ranges.find((r) => p.port >= r.from && p.port <= r.to);
    if (!matchedRange) continue;
    const assignment = assignmentByPort.get(p.port);
    if (assignment && assignment.project === p.projectName) continue;
    seen.add(p.port);
    out.push({
      port: p.port,
      claimants: [p],
      severity: 'warning',
      suggestion:
        `Port ${p.port} is inside the team reserved range ${matchedRange.from}–${matchedRange.to} ` +
        `(${matchedRange.purpose}). Move outside the range or claim it via .berth/team.json.`,
    });
  }
  return out;
}
