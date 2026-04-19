import { createEnv, type CreateEnvOptions, type TypedEnv } from "./core.js";

export const ENVALID_TOKEN = Symbol.for("envalid/env");

/**
 * Returns a NestJS-compatible provider factory. Declare in a module:
 *
 * ```ts
 * providers: [envalidProvider({ schemaPath: ".env.schema" })]
 * ```
 *
 * Consumers `@Inject(ENVALID_TOKEN)` to get the typed env object.
 */
export function envalidProvider(options?: CreateEnvOptions) {
  return {
    provide: ENVALID_TOKEN,
    useFactory: (): Readonly<TypedEnv> => createEnv(options),
  };
}

export function getEnv(options?: CreateEnvOptions): Readonly<TypedEnv> {
  return createEnv(options);
}
