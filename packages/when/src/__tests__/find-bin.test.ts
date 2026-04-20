import { describe, it, expect } from 'vitest';
import { buildSpawn, findBin } from '../utils/find-bin.js';

describe('findBin', () => {
  it('resolves @whenlabs/aware to its dist/cli.js', () => {
    const resolved = findBin('aware');
    // Workspace install has aware next to us, so we should land on a .js path
    expect(resolved.endsWith('cli.js')).toBe(true);
  });

  it('returns the bare name when a sibling package is missing', () => {
    expect(findBin('definitely-not-a-real-tool')).toBe(
      'definitely-not-a-real-tool',
    );
  });
});

describe('buildSpawn', () => {
  it('wraps a .js resolution with node as the interpreter', () => {
    const s = buildSpawn('aware');
    expect(s.cmd).toBe(process.execPath);
    expect(s.args[0]?.endsWith('cli.js')).toBe(true);
  });

  it('falls back to the bare name for unknown tools', () => {
    const s = buildSpawn('definitely-not-a-real-tool');
    expect(s.cmd).toBe('definitely-not-a-real-tool');
    expect(s.args).toEqual([]);
  });
});
