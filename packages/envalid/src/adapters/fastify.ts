import { createEnv, type CreateEnvOptions, type TypedEnv } from "./core.js";

type FastifyInstanceLike = {
  decorate: (key: string, value: unknown) => unknown;
  addHook?: (
    name: "onRequest",
    handler: (
      req: unknown,
      _reply: unknown,
      done: (err?: Error) => void,
    ) => void,
  ) => unknown;
};

/**
 * Fastify plugin factory. Validates env at registration time and decorates
 * the fastify instance with `env`.
 */
export function envalidFastifyPlugin(options?: CreateEnvOptions) {
  const env = createEnv(options);
  return async function envalidPlugin(fastify: FastifyInstanceLike) {
    fastify.decorate("env", env);
  };
}

export function getEnv(options?: CreateEnvOptions): Readonly<TypedEnv> {
  return createEnv(options);
}
