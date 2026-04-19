import type { SecretProvider, Registry } from "../runtime/registry.js";

/**
 * Parse a secret reference of the form @scheme:payload. Returns undefined if
 * the input doesn't look like a ref.
 */
export function parseSecretRef(
  input: string,
): { scheme: string; payload: string } | undefined {
  if (!input.startsWith("@")) return undefined;
  const idx = input.indexOf(":");
  if (idx < 0) return undefined;
  const scheme = input.slice(1, idx);
  if (!/^[a-z][a-z0-9-]*$/.test(scheme)) return undefined;
  return { scheme, payload: input.slice(idx + 1) };
}

export interface ResolveResult {
  /** The env variable whose raw value was a secret ref. */
  variable: string;
  ok: boolean;
  /** Present when ok. */
  value?: string;
  /** Present when !ok. */
  error?: string;
  /** The scheme that was (or would have been) used. */
  scheme: string;
  /** Original raw ref for masked logging. */
  ref: string;
}

export interface ResolveSecretsOptions {
  registry: Registry;
  /** When false, unresolved refs are replaced with an empty value and a skipped result is emitted. */
  live?: boolean;
  /** Cache TTL in milliseconds. Default 5 minutes. */
  ttlMs?: number;
  cache?: SecretCache;
  signal?: AbortSignal;
  /** Max retries per provider call. Default 3. */
  retries?: number;
}

export interface ResolveSecretsReturn {
  /** Variables with refs replaced by their resolved values (or left unchanged on failure). */
  variables: Record<string, string>;
  /** Which variables had refs (resolved or not), so we can auto-mark them sensitive. */
  sensitiveKeys: Set<string>;
  results: ResolveResult[];
}

export interface SecretCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export function createMemoryCache(ttlMs: number): SecretCache {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 2 ** i * 50));
      }
    }
  }
  throw lastErr;
}

/**
 * Walk a variables object, replacing any @scheme:… values with resolved secrets.
 * Returns the (possibly mutated) variables and a structured result per ref.
 */
export async function resolveSecrets(
  variables: Record<string, string>,
  options: ResolveSecretsOptions,
): Promise<ResolveSecretsReturn> {
  const cache = options.cache ?? createMemoryCache(options.ttlMs ?? 5 * 60_000);
  const retries = options.retries ?? 3;
  const out: Record<string, string> = { ...variables };
  const sensitiveKeys = new Set<string>();
  const results: ResolveResult[] = [];

  for (const [name, value] of Object.entries(variables)) {
    const parsed = parseSecretRef(value);
    if (!parsed) continue;
    sensitiveKeys.add(name);

    if (!options.live) {
      results.push({
        variable: name,
        scheme: parsed.scheme,
        ref: value,
        ok: false,
        error: "skipped (offline / --no-check-live)",
      });
      continue;
    }

    const provider = options.registry.getProvider(parsed.scheme);
    if (!provider) {
      results.push({
        variable: name,
        scheme: parsed.scheme,
        ref: value,
        ok: false,
        error: `No provider registered for scheme "${parsed.scheme}"`,
      });
      continue;
    }

    const cacheKey = `${parsed.scheme}:${parsed.payload}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      out[name] = cached;
      results.push({
        variable: name,
        scheme: parsed.scheme,
        ref: value,
        ok: true,
        value: cached,
      });
      continue;
    }

    try {
      const resolved = await withRetry(
        () => provider.resolve(parsed.payload, { signal: options.signal }),
        retries,
      );
      cache.set(cacheKey, resolved);
      out[name] = resolved;
      results.push({
        variable: name,
        scheme: parsed.scheme,
        ref: value,
        ok: true,
        value: resolved,
      });
    } catch (err) {
      results.push({
        variable: name,
        scheme: parsed.scheme,
        ref: value,
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  return { variables: out, sensitiveKeys, results };
}

/** Convenience stub provider factory — produces a provider that returns a
 * fixed string. Useful for tests and as a reference implementation. */
export function defineProvider(
  scheme: string,
  resolve: SecretProvider["resolve"],
): SecretProvider {
  return { scheme, resolve };
}
