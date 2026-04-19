import type {
  ActivePort,
  DockerPort,
  ConfiguredPort,
  BerthConfig,
  Platform,
} from '../types.js';
import { shellExec } from '../utils/platform.js';

export interface DetectLogger {
  warn(msg: string): void;
  debug(msg: string): void;
}

export interface DetectContext {
  shellExec: typeof shellExec;
  config?: BerthConfig;
  logger: DetectLogger;
}

export interface ConfiguredDetectContext extends DetectContext {
  dir: string;
}

export interface ActiveDetector {
  name: string;
  kind: 'active';
  platforms?: Platform[];
  detect(ctx: DetectContext): Promise<ActivePort[]>;
}

export interface DockerDetector {
  name: string;
  kind: 'docker';
  platforms?: Platform[];
  detect(ctx: DetectContext): Promise<DockerPort[]>;
}

export interface ConfiguredDetector {
  name: string;
  kind: 'configured';
  detect(ctx: ConfiguredDetectContext): Promise<ConfiguredPort[]>;
}

export type Detector = ActiveDetector | DockerDetector | ConfiguredDetector;

export function defineActiveDetector(d: ActiveDetector): ActiveDetector {
  return d;
}

export function defineDockerDetector(d: DockerDetector): DockerDetector {
  return d;
}

export function defineConfiguredDetector(d: ConfiguredDetector): ConfiguredDetector {
  return d;
}

export interface BerthPluginRegistry {
  registerActive(d: ActiveDetector): void;
  registerDocker(d: DockerDetector): void;
  registerConfigured(d: ConfiguredDetector): void;
  /**
   * Remove a detector by name (any kind). Useful for plugins that replace a builtin.
   */
  unregister(name: string): void;
}

export type BerthPlugin = (registry: BerthPluginRegistry) => void | Promise<void>;
