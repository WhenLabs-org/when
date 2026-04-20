import path from 'node:path';
import type { BerthConfig } from '../types.js';
import { loadConfig } from '../config/loader.js';
import { loadPlugins } from '../config/plugins.js';
import { createDefaultRegistry } from '../detectors/index.js';
import type { DetectorRegistry } from '../detectors/registry.js';

export interface ScanContext {
  dir: string;
  config?: BerthConfig;
  configPath?: string;
  detectorRegistry: DetectorRegistry;
  warnings: string[];
}

export async function buildScanContext(dir: string): Promise<ScanContext> {
  const absDir = path.resolve(dir);
  const warnings: string[] = [];

  const detectorRegistry = createDefaultRegistry();

  let config: BerthConfig | undefined;
  let configPath: string | undefined;
  try {
    const loaded = await loadConfig(absDir);
    if (loaded) {
      config = loaded.config;
      configPath = loaded.filePath;
      if (config.plugins && config.plugins.length > 0) {
        try {
          await loadPlugins(config.plugins, loaded.filePath, detectorRegistry);
        } catch (err) {
          warnings.push((err as Error).message);
        }
      }
    }
  } catch (err) {
    warnings.push(`Config load failed: ${(err as Error).message}`);
  }

  return { dir: absDir, config, configPath, detectorRegistry, warnings };
}
