import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BerthPlugin, BerthPluginRegistry } from '../detectors/api.js';

export class PluginLoadError extends Error {
  constructor(
    public readonly spec: string,
    public readonly cause: Error,
  ) {
    super(`failed to load plugin "${spec}": ${cause.message}`);
    this.name = 'PluginLoadError';
  }
}

async function importPlugin(spec: string, configFilePath: string): Promise<BerthPlugin> {
  const req = createRequire(configFilePath);
  let resolved: string;
  try {
    resolved = req.resolve(spec);
  } catch (err) {
    throw new PluginLoadError(spec, err as Error);
  }
  const url = pathToFileURL(resolved).href;
  const mod = await import(url);
  const fn = (mod as { default?: BerthPlugin }).default ?? (mod as unknown as BerthPlugin);
  if (typeof fn !== 'function') {
    throw new PluginLoadError(spec, new Error('plugin default export must be a function'));
  }
  return fn;
}

export async function loadPlugins(
  plugins: string[],
  configFilePath: string,
  registry: BerthPluginRegistry,
): Promise<void> {
  const configDir = path.dirname(configFilePath);
  for (const spec of plugins) {
    // Relative specifiers resolve against the config file's dir.
    const resolvedSpec = spec.startsWith('.') ? path.resolve(configDir, spec) : spec;
    const plugin = await importPlugin(resolvedSpec, configFilePath);
    await plugin(registry);
  }
}
