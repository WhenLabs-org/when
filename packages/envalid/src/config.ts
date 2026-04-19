import { cosmiconfig } from "cosmiconfig";
import type { ReporterFormat } from "./reporters/index.js";
import type { PluginInput } from "./runtime/plugin.js";

export interface EnvalidConfig {
  schema?: string;
  env?: string;
  format?: ReporterFormat;
  ci?: boolean;
  exclude?: string[];
  /** Plugins (module specifiers or EnvalidPlugin objects). */
  plugins?: PluginInput[];
  /** Concurrency cap for async validators. */
  concurrency?: number;
  /** Enable network-backed validators / secret providers. */
  checkLive?: boolean;
  /** Resolve secret references (@vault:…, @aws-sm:…, …). Default true. */
  resolveSecrets?: boolean;
}

const explorer = cosmiconfig("envalid");

export async function loadConfig(): Promise<EnvalidConfig> {
  const result = await explorer.search();
  return (result?.config as EnvalidConfig) ?? {};
}

export function mergeOptions<T extends Record<string, unknown>>(
  config: EnvalidConfig,
  cliOptions: T,
): T {
  // CLI options take precedence over config file
  const merged = { ...cliOptions };
  for (const [key, value] of Object.entries(config)) {
    const k = key as keyof T;
    if (merged[k] === undefined || merged[k] === null) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}
