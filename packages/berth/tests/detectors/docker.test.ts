import { describe, it, expect } from 'vitest';
import { parseDockerOutput } from '../../src/detectors/active/docker.js';

describe('parseDockerOutput', () => {
  it('should parse standard docker ps output', () => {
    const output = `abc123\tmy-db\tpostgres:16-alpine\t0.0.0.0:5432->5432/tcp\tUp 2 hours
def456\tmy-redis\tredis:7-alpine\t0.0.0.0:6379->6379/tcp\tUp 2 hours`;

    const ports = parseDockerOutput(output);
    expect(ports.length).toBe(2);

    expect(ports[0].port).toBe(5432);
    expect(ports[0].containerPort).toBe(5432);
    expect(ports[0].containerName).toBe('my-db');
    expect(ports[0].image).toBe('postgres:16-alpine');
    expect(ports[0].protocol).toBe('tcp');
    expect(ports[0].status).toBe('up');
  });

  it('should handle multiple port mappings per container', () => {
    const output = `abc123\tmy-app\tnginx:latest\t0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp\tUp 1 hour`;
    const ports = parseDockerOutput(output);
    expect(ports.length).toBe(2);
    expect(ports[0].port).toBe(80);
    expect(ports[1].port).toBe(443);
  });

  it('should handle IPv6 port mappings', () => {
    const output = `abc123\tmy-db\tpostgres:16\t:::5432->5432/tcp\tUp 1 hour`;
    const ports = parseDockerOutput(output);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(5432);
  });

  it('should skip container-internal ports (no host binding)', () => {
    const output = `abc123\tmy-app\tnode:20\t3000/tcp\tUp 1 hour`;
    const ports = parseDockerOutput(output);
    expect(ports.length).toBe(0);
  });

  it('should return empty array for empty output', () => {
    expect(parseDockerOutput('')).toEqual([]);
  });

  it('should handle containers with no ports', () => {
    const output = `abc123\tmy-worker\tnode:20\t\tUp 1 hour`;
    const ports = parseDockerOutput(output);
    expect(ports.length).toBe(0);
  });

  it('should handle mixed port formats', () => {
    const output = `abc123\tmy-app\tapp:latest\t0.0.0.0:3000->3000/tcp, 5432/tcp, 0.0.0.0:6379->6379/tcp\tUp`;
    const ports = parseDockerOutput(output);
    expect(ports.length).toBe(2); // skips 5432/tcp (no host binding)
    expect(ports[0].port).toBe(3000);
    expect(ports[1].port).toBe(6379);
  });
});
