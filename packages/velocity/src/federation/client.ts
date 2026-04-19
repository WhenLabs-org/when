// Opt-in federated priors. Velocity ships with this OFF. When the user runs
// `velocity-mcp federation enable`, we write ~/.velocity-mcp/federation.json
// and begin uploading a narrow whitelist of metadata for each completed task.
// Priors from the server are mixed into estimates when local history is thin.
//
// PRIVACY (enforced by the UPLOAD_FIELD_WHITELIST constant below):
//   NEVER uploaded: description, notes, project, git_diff_stat, task id.
//   Only uploaded: category, duration_seconds, files_changed, lines_added,
//                  lines_removed, model_id, context_tokens,
//                  tests_passed_first_try, tags_hashed (per-user salted).

import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Category, TaskRow } from '../types.js';

export const CLIENT_VERSION = '0.1.3';

// Fields that may leave the machine. The payload construction asserts that it
// ships only these keys; any extra key is dropped.
export const UPLOAD_FIELD_WHITELIST = [
  'category',
  'duration_seconds',
  'files_changed',
  'lines_added',
  'lines_removed',
  'model_id',
  'context_tokens',
  'tests_passed_first_try',
  'tags_hashed',
  'client_version',
] as const;

export type UploadField = typeof UPLOAD_FIELD_WHITELIST[number];

export interface UploadPayload {
  category: Category;
  duration_seconds: number;
  files_changed: number | null;
  lines_added: number | null;
  lines_removed: number | null;
  model_id: string | null;
  context_tokens: number | null;
  tests_passed_first_try: 0 | 1 | null;
  tags_hashed: string[];
  client_version: string;
}

export interface PriorsQuery {
  category: Category;
  model_id?: string | null;
}

export interface Priors {
  n: number;
  p25_seconds: number;
  median_seconds: number;
  p75_seconds: number;
  updated_at?: string;
}

export interface FederationConfig {
  enabled: boolean;
  endpoint: string;
  salt: string;          // hex-encoded random salt used for tag HMAC
}

export interface FederationTransport {
  upload(endpoint: string, payload: UploadPayload, timeoutMs: number): Promise<void>;
  fetchPriors(endpoint: string, q: PriorsQuery, timeoutMs: number): Promise<Priors | null>;
}

// ---------------------------------------------------------------------------
// Config I/O

export function configPath(): string {
  return join(homedir(), '.velocity-mcp', 'federation.json');
}

export function loadConfig(path: string = configPath()): FederationConfig | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FederationConfig>;
    if (typeof parsed.enabled !== 'boolean' || typeof parsed.salt !== 'string' || typeof parsed.endpoint !== 'string') {
      return null;
    }
    return {
      enabled: parsed.enabled,
      endpoint: parsed.endpoint,
      salt: parsed.salt,
    };
  } catch {
    return null;
  }
}

export function saveConfig(cfg: FederationConfig, path: string = configPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

export function generateSalt(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Enable federation. Requires an explicit endpoint — there is no public
 * default server. Creates the config if missing (with a fresh per-user salt),
 * otherwise flips `enabled` to true. Never regenerates the salt on re-enable
 * since that would invalidate any server-side tag aggregations.
 */
export function enableFederation(endpoint: string, path: string = configPath()): FederationConfig {
  if (!endpoint || !/^https?:\/\//.test(endpoint)) {
    throw new Error('endpoint must be an http(s) URL; no public server exists yet');
  }
  const existing = loadConfig(path);
  const cfg: FederationConfig = existing
    ? { ...existing, enabled: true, endpoint: existing.endpoint || endpoint }
    : { enabled: true, endpoint, salt: generateSalt() };
  saveConfig(cfg, path);
  return cfg;
}

export function disableFederation(path: string = configPath()): FederationConfig | null {
  const cfg = loadConfig(path);
  if (!cfg) return null;
  const updated = { ...cfg, enabled: false };
  saveConfig(updated, path);
  return updated;
}

// ---------------------------------------------------------------------------
// Tag hashing

/**
 * Hash a tag with the user's salt. Truncated to 64 bits (16 hex chars) —
 * plenty of entropy to avoid accidental collisions but opaque across users
 * (a different salt -> a different hash for the same tag).
 */
export function hashTag(salt: string, tag: string): string {
  return createHmac('sha256', salt).update(tag).digest('hex').slice(0, 16);
}

export function hashTags(salt: string, tags: string[]): string[] {
  return tags.map(t => hashTag(salt, t));
}

// ---------------------------------------------------------------------------
// Payload construction (the privacy-critical step)

/**
 * Build the upload payload from a completed TaskRow. Strictly emits only the
 * whitelisted fields — any extra fields in TaskRow are dropped. Returns null
 * if the task isn't uploadable (missing required fields).
 */
export function buildUploadPayload(row: TaskRow, salt: string): UploadPayload | null {
  if (row.duration_seconds == null || row.duration_seconds <= 0) return null;
  if (row.status !== 'completed') return null;

  let tags: string[] = [];
  try { tags = JSON.parse(row.tags || '[]') as string[]; } catch { /* ignore */ }

  const tpft = row.tests_passed_first_try;
  const normalizedTpft: 0 | 1 | null = tpft === 1 ? 1 : tpft === 0 ? 0 : null;

  const payload: UploadPayload = {
    category: row.category,
    duration_seconds: row.duration_seconds,
    files_changed: row.files_changed ?? null,
    lines_added: row.lines_added ?? null,
    lines_removed: row.lines_removed ?? null,
    model_id: row.model_id ?? null,
    context_tokens: row.context_tokens ?? null,
    tests_passed_first_try: normalizedTpft,
    tags_hashed: hashTags(salt, tags),
    client_version: CLIENT_VERSION,
  };

  // Belt-and-suspenders: drop anything that isn't on the whitelist.
  const allowed = new Set<string>(UPLOAD_FIELD_WHITELIST);
  const sink = payload as unknown as Record<string, unknown>;
  for (const key of Object.keys(sink)) {
    if (!allowed.has(key)) delete sink[key];
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Default transport (native fetch). Mockable for tests.

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const defaultTransport: FederationTransport = {
  async upload(endpoint, payload, timeoutMs) {
    const url = endpoint.replace(/\/$/, '') + '/v1/tasks';
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': `velocity-mcp/${CLIENT_VERSION}` },
      body: JSON.stringify(payload),
    }, timeoutMs);
    if (!res.ok) throw new Error(`upload ${res.status}`);
  },

  async fetchPriors(endpoint, q, timeoutMs) {
    const url = new URL(endpoint.replace(/\/$/, '') + '/v1/priors');
    url.searchParams.set('category', q.category);
    if (q.model_id) url.searchParams.set('model_id', q.model_id);
    const res = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: { 'accept': 'application/json', 'user-agent': `velocity-mcp/${CLIENT_VERSION}` },
    }, timeoutMs);
    if (!res.ok) return null;
    const data = await res.json() as Partial<Priors>;
    if (typeof data.n !== 'number' || data.n <= 0) return null;
    if (typeof data.p25_seconds !== 'number' || typeof data.median_seconds !== 'number' || typeof data.p75_seconds !== 'number') return null;
    return {
      n: data.n,
      p25_seconds: data.p25_seconds,
      median_seconds: data.median_seconds,
      p75_seconds: data.p75_seconds,
      updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
    };
  },
};

// ---------------------------------------------------------------------------
// Injectable transport (tests swap this out).

let transport: FederationTransport = defaultTransport;
export function setTransport(t: FederationTransport | null): void {
  transport = t ?? defaultTransport;
}
export function getTransport(): FederationTransport {
  return transport;
}

// ---------------------------------------------------------------------------
// Best-effort upload + priors cache

const UPLOAD_TIMEOUT_MS = 2000;
const FETCH_TIMEOUT_MS = 2000;
const PRIORS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 h

interface CachedPrior { at: number; priors: Priors | null }
const priorsCache = new Map<string, CachedPrior>();

function cacheKey(q: PriorsQuery): string {
  return `${q.category}|${q.model_id ?? 'any'}`;
}

export function clearPriorsCache(): void { priorsCache.clear(); }

/** Fire-and-forget upload. Returns immediately. Errors are swallowed.
 * Intentionally has no filesystem side effects — tests and callers passing
 * an explicit cfg must not risk writing to the default config path. */
export function uploadIfEnabled(row: TaskRow, cfg: FederationConfig | null = loadConfig()): void {
  if (!cfg || !cfg.enabled) return;
  const payload = buildUploadPayload(row, cfg.salt);
  if (!payload) return;
  const t = getTransport();
  t.upload(cfg.endpoint, payload, UPLOAD_TIMEOUT_MS)
    .catch(() => { /* non-fatal */ });
}

/** Cached priors fetch. Returns null if federation is off or the server
 * doesn't have enough data. */
export async function fetchPriorsIfEnabled(q: PriorsQuery, cfg: FederationConfig | null = loadConfig()): Promise<Priors | null> {
  if (!cfg || !cfg.enabled) return null;
  const key = cacheKey(q);
  const cached = priorsCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < PRIORS_CACHE_TTL_MS) return cached.priors;
  try {
    const priors = await getTransport().fetchPriors(cfg.endpoint, q, FETCH_TIMEOUT_MS);
    priorsCache.set(key, { at: now, priors });
    return priors;
  } catch {
    priorsCache.set(key, { at: now, priors: null });
    return null;
  }
}
