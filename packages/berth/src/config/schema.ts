import type { BerthConfig } from '../types.js';

export const CONFIG_FILE_CANDIDATES = [
  'berth.config.js',
  'berth.config.mjs',
  'berth.config.cjs',
  '.berthrc.json',
  '.berthrc',
] as const;

export type ConfigFileFormat = 'js' | 'mjs' | 'cjs' | 'json' | 'rc' | 'package-json';

export function formatForFile(filename: string): ConfigFileFormat {
  if (filename === 'package.json') return 'package-json';
  if (filename.endsWith('.mjs')) return 'mjs';
  if (filename.endsWith('.cjs')) return 'cjs';
  if (filename.endsWith('.js')) return 'js';
  if (filename.endsWith('.json')) return 'json';
  return 'rc';
}

export function defineConfig(config: BerthConfig): BerthConfig {
  return config;
}
