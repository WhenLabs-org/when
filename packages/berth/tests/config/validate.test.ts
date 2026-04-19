import { describe, it, expect } from 'vitest';
import { ConfigValidationError, validateConfig } from '../../src/config/validate.js';

describe('validateConfig', () => {
  it('accepts an empty config', () => {
    expect(validateConfig({})).toEqual({});
  });

  it('accepts a complete valid config', () => {
    const config = validateConfig({
      projectName: 'my-app',
      ports: { web: 3000, api: { port: 4000, required: true, description: 'API' } },
      aliases: { frontend: 'web' },
      reservedRanges: [{ from: 5000, to: 5010, reason: 'db' }],
      frameworks: { disable: ['Next.js'], override: { Vite: 5174 } },
      plugins: ['./my-plugin.js'],
      apiVersion: 1,
    });
    expect(config.projectName).toBe('my-app');
    expect(config.ports?.web).toBe(3000);
    expect(config.ports?.api).toEqual({ port: 4000, required: true, description: 'API' });
    expect(config.reservedRanges).toHaveLength(1);
    expect(config.frameworks?.override?.Vite).toBe(5174);
  });

  it('rejects non-object root', () => {
    expect(() => validateConfig('string')).toThrow(ConfigValidationError);
    expect(() => validateConfig(null)).toThrow(ConfigValidationError);
    expect(() => validateConfig([])).toThrow(ConfigValidationError);
  });

  it('rejects invalid port numbers', () => {
    expect(() => validateConfig({ ports: { web: 0 } })).toThrow(/ports.web/);
    expect(() => validateConfig({ ports: { web: 70000 } })).toThrow(/ports.web/);
    expect(() => validateConfig({ ports: { web: { port: -1 } } })).toThrow(/ports.web.port/);
  });

  it('rejects invalid reservedRanges', () => {
    expect(() =>
      validateConfig({ reservedRanges: [{ from: 5000, to: 4000 }] }),
    ).toThrow(/from must be <= to/);
    expect(() => validateConfig({ reservedRanges: [{ from: 0, to: 100 }] })).toThrow(
      /reservedRanges\[0\]\.from/,
    );
  });

  it('rejects non-string plugin entries', () => {
    expect(() => validateConfig({ plugins: [123] })).toThrow(/plugins\[0\]/);
  });

  it('rejects unknown apiVersion', () => {
    expect(() => validateConfig({ apiVersion: 2 })).toThrow(/apiVersion/);
  });

  it('simplifies a port object with no extra fields to a plain number', () => {
    const config = validateConfig({ ports: { web: { port: 3000 } } });
    expect(config.ports?.web).toBe(3000);
  });
});
