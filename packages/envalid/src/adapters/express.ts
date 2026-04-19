import { createEnv, type CreateEnvOptions, type TypedEnv } from "./core.js";

let envInstance: Readonly<TypedEnv> | undefined;

export function initEnv(options?: CreateEnvOptions): Readonly<TypedEnv> {
  envInstance = createEnv(options);
  return envInstance;
}

/** Returns the cached env object, initializing on first access. */
export function getEnv(options?: CreateEnvOptions): Readonly<TypedEnv> {
  if (!envInstance) envInstance = createEnv(options);
  return envInstance;
}

/**
 * Express middleware. Validates on first request (or on import if you call
 * `initEnv` directly) and attaches the typed env to `req.env` for downstream
 * handlers.
 */
export function envalidMiddleware(options?: CreateEnvOptions) {
  const env = getEnv(options);
  return function envalidExpressMiddleware(
    req: { env?: Readonly<TypedEnv> },
    _res: unknown,
    next: () => void,
  ) {
    req.env = env;
    next();
  };
}
