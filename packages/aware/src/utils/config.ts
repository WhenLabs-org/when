import * as path from "node:path";
import * as crypto from "node:crypto";
import { readFile, writeFile, fileExists } from "./fs.js";
import { CONFIG_FILE, SCHEMA_VERSION, VERSION } from "../constants.js";
import { migrate } from "../schema/migrate.js";
import type { AwareConfig, StackConfig, TargetsConfig } from "../types.js";

export interface LoadedConfig {
  config: AwareConfig;
  migrated: boolean;
  fromVersion: number;
}

/**
 * Load and (if needed) migrate a `.aware.json` to the current schema.
 *
 * Return semantics:
 *   - `null`            — file absent, or present but malformed JSON.
 *   - throws            — file present and parseable, but migration failed
 *                         (future schema version, corrupt v1 shape, etc.).
 *
 * Callers used to get `null` for *any* failure, which silently dropped data.
 * Migration errors are now surfaced so `aware init` doesn't accidentally
 * overwrite a broken-but-recoverable config.
 */
export async function loadConfigWithMeta(
  projectRoot: string,
): Promise<LoadedConfig | null> {
  const filePath = path.join(projectRoot, CONFIG_FILE);
  const content = await readFile(filePath);
  if (!content) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  return migrate(raw);
}

export async function loadConfig(projectRoot: string): Promise<AwareConfig | null> {
  const loaded = await loadConfigWithMeta(projectRoot);
  return loaded?.config ?? null;
}

export async function saveConfig(projectRoot: string, config: AwareConfig): Promise<void> {
  const filePath = path.join(projectRoot, CONFIG_FILE);
  await writeFile(filePath, JSON.stringify(config, null, 2) + "\n");
}

export async function configExists(projectRoot: string): Promise<boolean> {
  return fileExists(path.join(projectRoot, CONFIG_FILE));
}

export function createDefaultConfig(
  projectName: string,
  stack: StackConfig,
  targets: TargetsConfig,
): AwareConfig {
  const hash = computeDetectionHash(stack);

  return {
    version: SCHEMA_VERSION,
    project: {
      name: projectName,
      description: "",
      architecture: "",
    },
    stack,
    conventions: {},
    rules: [],
    structure: {},
    targets,
    _meta: {
      createdAt: new Date().toISOString(),
      lastSyncedAt: null,
      lastDetectionHash: hash,
      awareVersion: VERSION,
      fileHashes: {},
      fragmentVersions: {},
    },
  };
}

export function computeDetectionHash(stack: StackConfig): string {
  return crypto.createHash("md5").update(JSON.stringify(stack)).digest("hex");
}
