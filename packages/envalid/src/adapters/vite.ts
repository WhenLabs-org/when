import { createEnv, type CreateEnvOptions, type TypedEnv } from "./core.js";

type VitePluginLike = {
  name: string;
  configResolved?: () => void | Promise<void>;
  buildStart?: () => void | Promise<void>;
};

/**
 * Vite plugin: runs validation at config resolution and surfaces failures as
 * build errors. The plugin only needs `createEnv`; we don't import `vite` to
 * avoid a peer dep.
 */
export function envalidVitePlugin(options?: CreateEnvOptions): VitePluginLike {
  return {
    name: "envalid",
    configResolved() {
      createEnv(options);
    },
  };
}

export function getEnv(options?: CreateEnvOptions): Readonly<TypedEnv> {
  return createEnv(options);
}
