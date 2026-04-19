import { describe, it, expect } from 'vitest';
import { DetectorRegistry } from '../../src/detectors/registry.js';
import {
  defineActiveDetector,
  defineConfiguredDetector,
  defineDockerDetector,
} from '../../src/detectors/api.js';
import { createDefaultRegistry } from '../../src/detectors/index.js';

describe('DetectorRegistry', () => {
  it('registers and lists detectors by kind', () => {
    const registry = new DetectorRegistry();
    const active = defineActiveDetector({
      name: 'custom-active',
      kind: 'active',
      async detect() {
        return [];
      },
    });
    const docker = defineDockerDetector({
      name: 'custom-docker',
      kind: 'docker',
      async detect() {
        return [];
      },
    });
    const configured = defineConfiguredDetector({
      name: 'custom-configured',
      kind: 'configured',
      async detect() {
        return [];
      },
    });

    registry.registerActive(active);
    registry.registerDocker(docker);
    registry.registerConfigured(configured);

    expect(registry.activeDetectors().map((d) => d.name)).toEqual(['custom-active']);
    expect(registry.dockerDetectors().map((d) => d.name)).toEqual(['custom-docker']);
    expect(registry.configuredDetectors().map((d) => d.name)).toEqual(['custom-configured']);
    expect(registry.has('custom-active')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('allows replacing a detector by re-registering the same name', () => {
    const registry = new DetectorRegistry();
    registry.registerConfigured(
      defineConfiguredDetector({
        name: 'pkg',
        kind: 'configured',
        async detect() {
          return [{ port: 1 } as any];
        },
      }),
    );
    registry.registerConfigured(
      defineConfiguredDetector({
        name: 'pkg',
        kind: 'configured',
        async detect() {
          return [{ port: 2 } as any];
        },
      }),
    );
    expect(registry.configuredDetectors()).toHaveLength(1);
  });

  it('unregister removes regardless of kind', () => {
    const registry = new DetectorRegistry();
    registry.registerActive(
      defineActiveDetector({ name: 'x', kind: 'active', async detect() { return []; } }),
    );
    registry.unregister('x');
    expect(registry.activeDetectors()).toEqual([]);
  });
});

describe('createDefaultRegistry', () => {
  it('pre-registers all the expected builtins', () => {
    const r = createDefaultRegistry();
    const configured = r.configuredDetectors().map((d) => d.name).sort();
    expect(configured).toEqual(
      [
        'berthrc',
        'devcontainer',
        'docker-compose',
        'dotenv',
        'makefile',
        'package-json',
        'procfile',
      ].sort(),
    );
    const active = r.activeDetectors().map((d) => d.name).sort();
    expect(active).toEqual(['lsof', 'netstat']);
    expect(r.dockerDetectors().map((d) => d.name)).toEqual(['docker']);
  });
});
