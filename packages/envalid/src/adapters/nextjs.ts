import { createEnv, type CreateEnvOptions, type TypedEnv } from "./core.js";

/**
 * Next.js adapter. Two entries:
 *   - `server`: includes every variable from the schema.
 *   - `client`: only `NEXT_PUBLIC_*` variables (plus any variable whose name
 *     begins with an allowed prefix passed via `publicPrefixes`).
 */
export function createServerEnv(
  options?: CreateEnvOptions,
): Readonly<TypedEnv> {
  return createEnv(options);
}

export interface CreateClientEnvOptions extends CreateEnvOptions {
  publicPrefixes?: string[];
}

export function createClientEnv(
  options: CreateClientEnvOptions = {},
): Readonly<TypedEnv> {
  const prefixes = options.publicPrefixes ?? ["NEXT_PUBLIC_"];
  const env = createEnv(options);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(env)) {
    if (prefixes.some((p) => k.startsWith(p))) out[k] = v;
  }
  return Object.freeze(out) as Readonly<TypedEnv>;
}
