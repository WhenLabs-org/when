import type {
  ActiveDetector,
  BerthPluginRegistry,
  ConfiguredDetector,
  DockerDetector,
} from './api.js';

export class DetectorRegistry implements BerthPluginRegistry {
  private active = new Map<string, ActiveDetector>();
  private docker = new Map<string, DockerDetector>();
  private configured = new Map<string, ConfiguredDetector>();

  registerActive(d: ActiveDetector): void {
    this.active.set(d.name, d);
  }

  registerDocker(d: DockerDetector): void {
    this.docker.set(d.name, d);
  }

  registerConfigured(d: ConfiguredDetector): void {
    this.configured.set(d.name, d);
  }

  unregister(name: string): void {
    this.active.delete(name);
    this.docker.delete(name);
    this.configured.delete(name);
  }

  activeDetectors(): ActiveDetector[] {
    return Array.from(this.active.values());
  }

  dockerDetectors(): DockerDetector[] {
    return Array.from(this.docker.values());
  }

  configuredDetectors(): ConfiguredDetector[] {
    return Array.from(this.configured.values());
  }

  has(name: string): boolean {
    return this.active.has(name) || this.docker.has(name) || this.configured.has(name);
  }

  clear(): void {
    this.active.clear();
    this.docker.clear();
    this.configured.clear();
  }
}
