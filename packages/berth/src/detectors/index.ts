import { getCurrentPlatform } from '../utils/platform.js';
import { shellExec } from '../utils/platform.js';
import { resolveAncestries } from '../utils/ancestry.js';
import { DetectorRegistry } from './registry.js';
import { registerBuiltins, runFrameworkDefaults } from './builtins.js';
import type { DetectContext, DetectLogger } from './api.js';
import type {
  ActivePort,
  BerthConfig,
  ConfiguredPort,
  DockerPort,
  Platform,
} from '../types.js';

export interface ActiveDetectionResult {
  ports: ActivePort[];
  docker: DockerPort[];
  warnings: string[];
}

export interface ConfiguredDetectionResult {
  ports: ConfiguredPort[];
  warnings: string[];
}

const silentLogger: DetectLogger = {
  warn: () => {},
  debug: () => {},
};

/**
 * Build a registry pre-populated with built-in detectors. Intended for callers
 * that want to add plugins on top (e.g. `buildScanContext`).
 */
export function createDefaultRegistry(): DetectorRegistry {
  const registry = new DetectorRegistry();
  registerBuiltins(registry);
  return registry;
}

function supportsPlatform(platforms: Platform[] | undefined, current: Platform): boolean {
  if (!platforms || platforms.length === 0) return true;
  return platforms.includes(current);
}

export interface DetectAllActiveOptions {
  registry?: DetectorRegistry;
  config?: BerthConfig;
  logger?: DetectLogger;
  /**
   * Resolve parent-process ancestry for each active port. Opt-in because it
   * fans out `ps` per PID.
   */
  trace?: boolean;
}

export async function detectAllActive(
  options: DetectAllActiveOptions = {},
): Promise<ActiveDetectionResult> {
  const registry = options.registry ?? createDefaultRegistry();
  const logger = options.logger ?? silentLogger;
  const ctx: DetectContext = { shellExec, config: options.config, logger };
  const platform = getCurrentPlatform();

  const warnings: string[] = [];
  let ports: ActivePort[] = [];
  let docker: DockerPort[] = [];

  const activeDetectors = registry
    .activeDetectors()
    .filter((d) => supportsPlatform(d.platforms, platform));
  const dockerDetectors = registry
    .dockerDetectors()
    .filter((d) => supportsPlatform(d.platforms, platform));

  const activeResults = await Promise.allSettled(activeDetectors.map((d) => d.detect(ctx)));
  for (let i = 0; i < activeResults.length; i++) {
    const result = activeResults[i];
    const name = activeDetectors[i].name;
    if (result.status === 'fulfilled') {
      ports.push(...result.value);
    } else {
      warnings.push(`Active detector "${name}" failed: ${result.reason}`);
    }
  }

  const dockerResults = await Promise.allSettled(dockerDetectors.map((d) => d.detect(ctx)));
  for (let i = 0; i < dockerResults.length; i++) {
    const result = dockerResults[i];
    const name = dockerDetectors[i].name;
    if (result.status === 'fulfilled') {
      docker.push(...result.value);
    } else {
      warnings.push(`Docker detector "${name}" failed: ${result.reason}`);
    }
  }

  if (options.trace && ports.length > 0) {
    try {
      const ancestries = await resolveAncestries(ports.map((p) => p.pid));
      ports = ports.map((p) => ({ ...p, ancestry: ancestries.get(p.pid) ?? undefined }));
    } catch (err) {
      warnings.push(`Ancestry resolution failed: ${(err as Error).message}`);
    }
  }

  return { ports, docker, warnings };
}

export interface DetectAllConfiguredOptions {
  registry?: DetectorRegistry;
  config?: BerthConfig;
  logger?: DetectLogger;
}

export async function detectAllConfigured(
  dir: string,
  options: DetectAllConfiguredOptions = {},
): Promise<ConfiguredDetectionResult> {
  const registry = options.registry ?? createDefaultRegistry();
  const logger = options.logger ?? silentLogger;
  const ctx = { shellExec, config: options.config, logger, dir };

  const warnings: string[] = [];
  const allPorts: ConfiguredPort[] = [];

  // Framework-defaults is intentionally not a plain detector — it needs the
  // set of already-found ports — so we skip it here and run it after.
  const detectors = registry.configuredDetectors();

  const results = await Promise.allSettled(detectors.map((d) => d.detect(ctx)));
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const name = detectors[i].name;
    if (result.status === 'fulfilled') {
      allPorts.push(...result.value);
    } else {
      warnings.push(`${name} detection failed: ${result.reason}`);
    }
  }

  const foundPorts = new Set(allPorts.map((p) => p.port));
  try {
    const frameworkPorts = await runFrameworkDefaults(dir, foundPorts, options.config);
    allPorts.push(...frameworkPorts);
  } catch (e) {
    warnings.push(`Framework detection failed: ${e}`);
  }

  return { ports: allPorts, warnings };
}
