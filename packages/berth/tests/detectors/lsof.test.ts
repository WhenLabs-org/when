import { describe, it, expect } from 'vitest';
import { parseLsofOutput } from '../../src/detectors/active/lsof.js';

const SAMPLE_LSOF_OUTPUT = `COMMAND     PID       USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      42156  siddharth   22u  IPv6 0x1234567890      0t0  TCP *:3000 (LISTEN)
node      42156  siddharth   23u  IPv4 0x1234567891      0t0  TCP *:3000 (LISTEN)
postgres    1823     _postgres   5u  IPv6 0xabcdef1234      0t0  TCP [::1]:5432 (LISTEN)
postgres    1823     _postgres   6u  IPv4 0xabcdef1235      0t0  TCP 127.0.0.1:5432 (LISTEN)
redis-ser   1901       _redis   6u  IPv4 0xfedcba9876      0t0  TCP 127.0.0.1:6379 (LISTEN)
node      43201  siddharth   18u  IPv4 0x9876543210      0t0  TCP *:5173 (LISTEN)
node      42389  siddharth   20u  IPv4 0x1111111111      0t0  TCP 0.0.0.0:8080 (LISTEN)`;

describe('parseLsofOutput', () => {
  it('should parse standard lsof output', () => {
    const ports = parseLsofOutput(SAMPLE_LSOF_OUTPUT);
    expect(ports.length).toBe(5); // 7 lines but 2 deduped (node:3000 and postgres:5432)

    const port3000 = ports.find((p) => p.port === 3000);
    expect(port3000).toBeDefined();
    expect(port3000!.pid).toBe(42156);
    expect(port3000!.process).toBe('node');
    expect(port3000!.user).toBe('siddharth');
  });

  it('should deduplicate same PID + port across IPv4/IPv6', () => {
    const ports = parseLsofOutput(SAMPLE_LSOF_OUTPUT);
    const node3000 = ports.filter((p) => p.port === 3000);
    expect(node3000.length).toBe(1);

    const postgres5432 = ports.filter((p) => p.port === 5432);
    expect(postgres5432.length).toBe(1);
  });

  it('should normalize addresses', () => {
    const ports = parseLsofOutput(SAMPLE_LSOF_OUTPUT);
    const port3000 = ports.find((p) => p.port === 3000);
    expect(port3000!.address).toBe('0.0.0.0'); // * normalized

    const port5432 = ports.find((p) => p.port === 5432);
    expect(port5432!.address).toBe('127.0.0.1'); // [::1] normalized
  });

  it('should return empty array for empty output', () => {
    expect(parseLsofOutput('')).toEqual([]);
    expect(parseLsofOutput('COMMAND PID USER')).toEqual([]);
  });

  it('should skip malformed lines', () => {
    const output = `COMMAND     PID       USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      42156  siddharth   22u  IPv6 0x1234567890      0t0  TCP *:3000 (LISTEN)
this is not a valid line
another bad line`;
    const ports = parseLsofOutput(output);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(3000);
  });

  it('should parse all port fields correctly', () => {
    const ports = parseLsofOutput(SAMPLE_LSOF_OUTPUT);
    const redis = ports.find((p) => p.port === 6379);
    expect(redis).toBeDefined();
    expect(redis!.pid).toBe(1901);
    expect(redis!.process).toBe('redis-ser');
    expect(redis!.address).toBe('127.0.0.1');
    expect(redis!.protocol).toBe('tcp');
    expect(redis!.source).toBe('lsof');
  });
});
