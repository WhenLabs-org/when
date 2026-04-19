import path from 'node:path';
import type { BerthConfig, Reservation, TeamConfig } from '../types.js';
import { loadConfig } from '../config/loader.js';
import { loadPlugins } from '../config/plugins.js';
import { loadTeamConfig, teamReservations } from '../config/team.js';
import { loadRegistry } from '../registry/store.js';
import { activeReservations } from '../registry/reservations.js';
import {
  createDefaultRegistry,
} from '../detectors/index.js';
import type { DetectorRegistry } from '../detectors/registry.js';

export interface ScanContext {
  dir: string;
  config?: BerthConfig;
  configPath?: string;
  team?: TeamConfig;
  teamPath?: string;
  detectorRegistry: DetectorRegistry;
  reservations: Reservation[];
  warnings: string[];
}

export interface BuildScanContextOptions {
  /**
   * Skip loading the user registry (and therefore reservations). Useful for
   * tests or commands that shouldn't pay the cost.
   */
  skipRegistry?: boolean;
}

/**
 * Aggregate everything a scan needs: config, plugins, detector registry,
 * reservations. Commands call this once and pass the result into detectors.
 */
export async function buildScanContext(
  dir: string,
  options: BuildScanContextOptions = {},
): Promise<ScanContext> {
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

  let reservations: Reservation[] = [];
  if (!options.skipRegistry) {
    try {
      const registry = await loadRegistry();
      reservations = activeReservations(registry);
    } catch (err) {
      warnings.push(`Registry load failed: ${(err as Error).message}`);
    }
  }

  let team: TeamConfig | undefined;
  let teamPath: string | undefined;
  try {
    const loadedTeam = await loadTeamConfig(absDir);
    if (loadedTeam) {
      team = loadedTeam.config;
      teamPath = loadedTeam.filePath;
      // Team reservations merge additively. Local (manual) wins for the same
      // port only if the user explicitly created a matching entry — we detect
      // that via source and port.
      const teamRes = teamReservations(team);
      const existingPorts = new Set(reservations.map((r) => r.port));
      for (const tr of teamRes) {
        if (!existingPorts.has(tr.port)) reservations.push(tr);
      }
    }
  } catch (err) {
    warnings.push(`Team config load failed: ${(err as Error).message}`);
  }

  return {
    dir: absDir,
    config,
    configPath,
    team,
    teamPath,
    detectorRegistry,
    reservations,
    warnings,
  };
}
