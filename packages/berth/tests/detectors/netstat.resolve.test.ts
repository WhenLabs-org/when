import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/platform.js', () => ({
  shellExec: vi.fn(),
}));

import { resolveProcessNames, detectActivePorts } from '../../src/detectors/active/netstat.js';
import { shellExec } from '../../src/utils/platform.js';
import type { ActivePort } from '../../src/types.js';

const mockShellExec = shellExec as unknown as ReturnType<typeof vi.fn>;

function makePort(pid: number, port = 3000): ActivePort {
  return {
    port,
    pid,
    process: 'unknown',
    command: 'unknown',
    user: '',
    protocol: 'tcp',
    address: '0.0.0.0',
    source: 'netstat',
  };
}

beforeEach(() => {
  mockShellExec.mockReset();
});

describe('resolveProcessNames', () => {
  it('resolves simple quoted process names from tasklist CSV', async () => {
    mockShellExec.mockResolvedValue({
      stdout: '"node.exe","42156","Console","1","120,000 K"\n',
      stderr: '',
      exitCode: 0,
    });

    const resolved = await resolveProcessNames([makePort(42156)]);
    expect(resolved[0].process).toBe('node.exe');
    expect(resolved[0].command).toBe('node.exe');
  });

  it('handles quoted names with spaces', async () => {
    mockShellExec.mockResolvedValue({
      stdout: '"Visual Studio Code.exe","42156","Console","1","240,000 K"\n',
      stderr: '',
      exitCode: 0,
    });

    const resolved = await resolveProcessNames([makePort(42156)]);
    expect(resolved[0].process).toBe('Visual Studio Code.exe');
  });

  it('leaves process as "unknown" when tasklist reports no match', async () => {
    mockShellExec.mockResolvedValue({
      stdout: 'INFO: No tasks are running which match the specified criteria.\n',
      stderr: '',
      exitCode: 0,
    });

    const resolved = await resolveProcessNames([makePort(99999)]);
    expect(resolved[0].process).toBe('unknown');
  });

  it('continues when tasklist itself fails', async () => {
    mockShellExec.mockRejectedValue(new Error('Command not found: tasklist'));

    const resolved = await resolveProcessNames([makePort(42156)]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].process).toBe('unknown');
  });

  it('deduplicates lookups per PID', async () => {
    mockShellExec.mockResolvedValue({
      stdout: '"node.exe","42156","Console","1","120,000 K"\n',
      stderr: '',
      exitCode: 0,
    });

    const ports = [makePort(42156, 3000), makePort(42156, 3001), makePort(42156, 3002)];
    await resolveProcessNames(ports);

    // One shellExec call per unique PID, not per port
    expect(mockShellExec).toHaveBeenCalledTimes(1);
  });

  it('preserves per-port fields while overwriting only process/command', async () => {
    mockShellExec.mockResolvedValue({
      stdout: '"node.exe","42156","Console","1","120,000 K"\n',
      stderr: '',
      exitCode: 0,
    });

    const input: ActivePort = {
      ...makePort(42156, 5432),
      address: '127.0.0.1',
    };
    const [out] = await resolveProcessNames([input]);
    expect(out.port).toBe(5432);
    expect(out.address).toBe('127.0.0.1');
    expect(out.process).toBe('node.exe');
  });
});

describe('detectActivePorts (netstat)', () => {
  it('returns [] when netstat is not found (ENOENT)', async () => {
    mockShellExec.mockRejectedValue(new Error('Command not found: netstat'));

    const ports = await detectActivePorts();
    expect(ports).toEqual([]);
  });

  it('returns [] on empty stdout', async () => {
    mockShellExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const ports = await detectActivePorts();
    expect(ports).toEqual([]);
  });
});
