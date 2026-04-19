import type { FragmentModule } from "../types.js";

/**
 * Aware plugin API. A plugin is an npm package (or local file) that
 * exports a `Plugin` — typically via the `definePlugin()` helper for
 * type safety:
 *
 * ```ts
 * // aware-plugin-acme/index.js
 * import { definePlugin, defineFragment } from "@whenlabs/aware";
 *
 * const acmeFragment = defineFragment({
 *   id: "acme-patterns",
 *   category: "framework",
 *   priority: 10,
 *   build: (stack, config) => ({ ... }),
 * });
 *
 * export default definePlugin({
 *   name: "aware-plugin-acme",
 *   version: "1.0.0",
 *   fragments: [acmeFragment],
 * });
 * ```
 *
 * The `defineFragment` / `definePlugin` helpers are identity functions
 * today — they exist to lock in the public-API shape. Future phases
 * may attach metadata or runtime validation; consumers that use them
 * get that for free.
 *
 * Scope for Phase 5: fragment plugins only. Detector and generator
 * plugins will arrive in a later phase once their registry refactors
 * land. When they do, the `Plugin` type grows additively — authors who
 * targeted this shape today won't need to change anything.
 *
 * Security note: plugins are ARBITRARY CODE executed at every aware
 * sync. There is currently no sandbox, allowlist, or signature
 * verification. Treat `.aware.json#plugins` with the same trust as
 * `package.json#scripts`. A dedicated sandbox / capability model is a
 * follow-up issue.
 */

export interface Plugin {
  /** Unique identifier; conventionally the npm package name. */
  name: string;
  /** Plugin version for drift/provenance (not the aware CLI version). */
  version?: string;
  /** Fragment modules contributed by this plugin. */
  fragments?: FragmentModule[];
}

/** Identity helper — returns the plugin unchanged, typed. */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

/** Identity helper — returns the fragment module unchanged, typed. */
export function defineFragment(module: FragmentModule): FragmentModule {
  return module;
}
