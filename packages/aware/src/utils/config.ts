import * as path from "node:path";
import * as crypto from "node:crypto";
import { readFile, writeFile, fileExists } from "./fs.js";
import { CONFIG_FILE, SCHEMA_VERSION, VERSION } from "../constants.js";
import type { ContextPilotConfig, StackConfig, TargetsConfig } from "../types.js";

export async function loadConfig(projectRoot: string): Promise<ContextPilotConfig | null> {
  const filePath = path.join(projectRoot, CONFIG_FILE);
  const content = await readFile(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as ContextPilotConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(projectRoot: string, config: ContextPilotConfig): Promise<void> {
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
): ContextPilotConfig {
  const hash = crypto.createHash("md5").update(JSON.stringify(stack)).digest("hex");

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
      contextpilotVersion: VERSION,
    },
  };
}

export function computeDetectionHash(stack: StackConfig): string {
  return crypto.createHash("md5").update(JSON.stringify(stack)).digest("hex");
}
