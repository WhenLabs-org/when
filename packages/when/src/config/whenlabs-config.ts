import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export interface StaleConfig {
  ignore?: string[];
  deep?: boolean;
}

export interface EnvalidConfig {
  schema?: string;
  environments?: string[];
}

export interface VowConfig {
  policy?: string;
  production_only?: boolean;
}

export interface BerthConfig {
  ports?: Record<string, number>;
}

export interface AwareConfig {
  targets?: string[];
}

export interface VelocityConfig {
  project?: string;
}

export interface WhenlabsConfig {
  stale?: StaleConfig;
  envalid?: EnvalidConfig;
  vow?: VowConfig;
  berth?: BerthConfig;
  aware?: AwareConfig;
  velocity?: VelocityConfig;
}

export const CONFIG_FILENAME = '.whenlabs.yml';

export function loadConfig(projectPath?: string): WhenlabsConfig | null {
  const dir = projectPath ?? process.cwd();
  const configPath = resolve(dir, CONFIG_FILENAME);
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as WhenlabsConfig;
  } catch {
    return null;
  }
}

export function getToolConfig<K extends keyof WhenlabsConfig>(
  toolName: K,
  projectPath?: string
): WhenlabsConfig[K] | null {
  const config = loadConfig(projectPath);
  if (!config) return null;
  return config[toolName] ?? null;
}
