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

  it('should parse TCPv6 protocol rows', () => {
    const output = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCPv6  [::]:4000              [::]:0                 LISTENING       51234
`;
    const ports = parseNetstatOutput(output);
    expect(ports).toHaveLength(1);
    expect(ports[0].port).toBe(4000);
    expect(ports[0].address).toBe('0.0.0.0');
  });

  it('should normalize * wildcard address to 0.0.0.0', () => {
    const output = `
  Proto  Local Address          Foreign Address        State           PID
  TCP    *:7000                 *:0                    LISTENING       4242
`;
    const ports = parseNetstatOutput(output);
    expect(ports).toHaveLength(1);
    expect(ports[0].port).toBe(7000);
    expect(ports[0].address).toBe('0.0.0.0');
  });

  it('should tolerate extra whitespace and blank lines', () => {
    const output = `\n\n  TCP    0.0.0.0:9000           0.0.0.0:0              LISTENING       12345   \n\n`;
    const ports = parseNetstatOutput(output);
    expect(ports).toHaveLength(1);
    expect(ports[0].port).toBe(9000);
    expect(ports[0].pid).toBe(12345);
  });

  it('should skip UDP rows (no LISTENING state)', () => {
    const output = `
  Proto  Local Address          Foreign Address        State           PID
  UDP    0.0.0.0:5353           *:*                                    4444
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       5555
`;
    const ports = parseNetstatOutput(output);
    expect(ports).toHaveLength(1);
    expect(ports[0].port).toBe(3000);
  });

  it('should skip malformed lines without a port', () => {
    const output = `
  TCP    0.0.0.0                0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       5555
`;
    const ports = parseNetstatOutput(output);
    expect(ports).toHaveLength(1);
    expect(ports[0].port).toBe(3000);
  });

  it('should reject out-of-range ports', () => {
    const output = `
  TCP    0.0.0.0:0              0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:65536          0.0.0.0:0              LISTENING       5678
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       9999
`;
    const ports = parseNetstatOutput(output);
    expect(ports.map((p) => p.port)).toEqual([3000]);
  });
});
