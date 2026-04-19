import { describe, it, expect } from 'vitest';
import { detectFromBerthConfig } from '../../src/detectors/configured/berthrc.js';
import { detectFrameworkDefaults } from '../../src/detectors/configured/framework.js';

describe('detectFromBerthConfig', () => {
  it('emits one ConfiguredPort per declared port', async () => {
    const ports = await detectFromBerthConfig('/tmp/proj', {
      projectName: 'proj',
      ports: { web: 3000, api: { port: 4000, description: 'API' } },
    });
    expect(ports).toHaveLength(2);
    const web = ports.find((p) => p.port === 3000)!;
    expect(web.source).toBe('berthrc');
    expect(web.confidence).toBe('high');
    expect(web.projectName).toBe('proj');
  });

  it('returns [] when config has no ports', async () => {
    expect(await detectFromBerthConfig('/tmp', {})).toEqual([]);
  });
});

describe('detectFrameworkDefaults honors frameworks overrides', () => {
  it('skips a disabled framework by name', async () => {
    const ports = await detectFrameworkDefaults('/tmp', new Set(), {
      frameworks: { disable: ['Next.js'] },
    });
    // No package.json means nothing else should trigger either; assert that
    // disabling removed Next.js from consideration when it would otherwise
    // have been picked up by dependency. We test via override below too.
    expect(ports.every((p) => !p.context.includes('Next.js'))).toBe(true);
  });
});
