import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectFromDockerCompose } from '../../src/detectors/configured/docker-compose.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portmap-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('detectFromDockerCompose', () => {
  it('should detect short syntax ports', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'docker-compose.yml'),
      `services:
  db:
    image: postgres:16
    ports:
      - "5432:5432"
  redis:
    image: redis:7
    ports:
      - "6379:6379"
`,
    );
    const ports = await detectFromDockerCompose(tmpDir);
    expect(ports.length).toBe(2);
    expect(ports.map((p) => p.port).sort()).toEqual([5432, 6379]);
    expect(ports[0].confidence).toBe('high');
  });

  it('should handle IP-prefixed short syntax', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'docker-compose.yml'),
      `services:
  db:
    image: postgres:16
    ports:
      - "127.0.0.1:5432:5432"
`,
    );
    const ports = await detectFromDockerCompose(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(5432);
  });

  it('should handle long syntax ports', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'docker-compose.yml'),
      `services:
  web:
    image: nginx
    ports:
      - target: 80
        published: 8080
        protocol: tcp
`,
    );
    const ports = await detectFromDockerCompose(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(8080);
  });

  it('should handle variable interpolation with defaults', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'docker-compose.yml'),
      `services:
  db:
    image: postgres:16
    ports:
      - "\${DB_PORT:-5433}:5432"
`,
    );
    const ports = await detectFromDockerCompose(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(5433);
  });

  it('should handle port ranges', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'docker-compose.yml'),
      `services:
  app:
    image: node:20
    ports:
      - "3000-3002:3000-3002"
`,
    );
    const ports = await detectFromDockerCompose(tmpDir);
    expect(ports.length).toBe(3);
    expect(ports.map((p) => p.port)).toEqual([3000, 3001, 3002]);
  });

  it('should detect environment PORT vars', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'docker-compose.yml'),
      `services:
  api:
    image: node:20
    environment:
      - PORT=4000
`,
    );
    const ports = await detectFromDockerCompose(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(4000);
    expect(ports[0].confidence).toBe('medium');
  });

  it('should try multiple compose filenames', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'compose.yaml'),
      `services:
  db:
    image: postgres:16
    ports:
      - "5432:5432"
`,
    );
    const ports = await detectFromDockerCompose(tmpDir);
    expect(ports.length).toBe(1);
  });

  it('should return empty for missing compose files', async () => {
    const ports = await detectFromDockerCompose(tmpDir);
    expect(ports.length).toBe(0);
  });
});
