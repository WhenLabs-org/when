import { describe, it, expect } from 'vitest';
import { parseNetstatOutput } from '../../src/detectors/active/netstat.js';

const SAMPLE_NETSTAT_OUTPUT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1120
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       42156
  TCP    0.0.0.0:5432           0.0.0.0:0              LISTENING       1823
  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       42389
  TCP    0.0.0.0:49152          0.0.0.0:0              LISTENING       0
  TCP    [::]:3000              [::]:0                 LISTENING       42156
`;

describe('parseNetstatOutput', () => {
  it('should parse standard netstat output', () => {
    const ports = parseNetstatOutput(SAMPLE_NETSTAT_OUTPUT);
    // Should skip PID 0 (system), but include [::]:3000 with PID 42156
    expect(ports.length).toBe(5);
  });

  it('should extract correct port numbers', () => {
    const ports = parseNetstatOutput(SAMPLE_NETSTAT_OUTPUT);
    const portNumbers = ports.map((p) => p.port).sort((a, b) => a - b);
    expect(portNumbers).toContain(135);
    expect(portNumbers).toContain(3000);
    expect(portNumbers).toContain(5432);
    expect(portNumbers).toContain(8080);
  });

  it('should skip system PIDs (0 and 4)', () => {
    const ports = parseNetstatOutput(SAMPLE_NETSTAT_OUTPUT);
    const pids = ports.map((p) => p.pid);
    expect(pids).not.toContain(0);
    expect(pids).not.toContain(4);
  });

  it('should set source to netstat', () => {
    const ports = parseNetstatOutput(SAMPLE_NETSTAT_OUTPUT);
    for (const port of ports) {
      expect(port.source).toBe('netstat');
    }
  });

  it('should return empty array for empty output', () => {
    expect(parseNetstatOutput('')).toEqual([]);
  });

  it('should normalize addresses', () => {
    const ports = parseNetstatOutput(SAMPLE_NETSTAT_OUTPUT);
    const port8080 = ports.find((p) => p.port === 8080);
    expect(port8080!.address).toBe('127.0.0.1');
  });
});
