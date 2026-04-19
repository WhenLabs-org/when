import type { EnvalidPlugin, Registry } from "./registry.js";
import { EnvalidError } from "../errors.js";

export type PluginInput = EnvalidPlugin | string;

/**
 * Resolve a plugin input to a concrete EnvalidPlugin object. Strings are
 * resolved by dynamic import relative to the current working directory.
 */
export async function resolvePlugin(
  input: PluginInput,
): Promise<EnvalidPlugin> {
  if (typeof input !== "string") return input;
  let mod: { default?: unknown } & Record<string, unknown>;
  try {
    mod = (await import(input)) as { default?: unknown } & Record<
      string,
      unknown
    >;
  } catch (err) {
    throw new EnvalidError(
      `Failed to load plugin "${input}": ${(err as Error).message}`,
      "PLUGIN_LOAD_ERROR",
    );
  }
  const candidate = mod.default ?? mod;
  const plugin =
    typeof candidate === "function"
      ? (candidate as () => EnvalidPlugin)()
      : (candidate as EnvalidPlugin);
  if (!plugin || typeof plugin.name !== "string") {
    throw new EnvalidError(
      `Plugin "${input}" did not export a valid plugin object`,
      "PLUGIN_INVALID",
    );
  }
  return plugin;
}

export async function loadPlugins(
  registry: Registry,
  inputs: PluginInput[] | undefined,
): Promise<void> {
  if (!inputs || inputs.length === 0) return;
  for (const input of inputs) {
    const plugin = await resolvePlugin(input);
    registry.registerPlugin(plugin);
  }
}
