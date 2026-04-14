import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectFromDotenv } from '../../src/detectors/configured/dotenv.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portmap-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('detectFromDotenv', () => {
  it('should detect PORT=3000', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'PORT=3000\n');
    const ports = await detectFromDotenv(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(3000);
    expect(ports[0].confidence).toBe('high');
  });

  it('should detect DB_PORT and API_PORT', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'DB_PORT=5432\nAPI_PORT=8080\n');
    const ports = await detectFromDotenv(tmpDir);
    expect(ports.length).toBe(2);
    expect(ports.map((p) => p.port).sort()).toEqual([5432, 8080]);
  });

  it('should extract port from DATABASE_URL', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.env'),
      'DATABASE_URL=postgres://localhost:5432/mydb\n',
    );
    const ports = await detectFromDotenv(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(5432);
    expect(ports[0].confidence).toBe('medium');
  });

  it('should extract port from REDIS_URL', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'REDIS_URL=redis://localhost:6379\n');
    const ports = await detectFromDotenv(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(6379);
  });

  it('should scan multiple .env files', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'PORT=3000\n');
    await fs.writeFile(path.join(tmpDir, '.env.local'), 'API_PORT=8080\n');
    const ports = await detectFromDotenv(tmpDir);
    expect(ports.length).toBe(2);
  });

  it('should return empty for missing .env files', async () => {
    const ports = await detectFromDotenv(tmpDir);
    expect(ports.length).toBe(0);
  });

  it('should handle inline comments', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'PORT=3000 # main port\n');
    const ports = await detectFromDotenv(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(3000);
  });

  it('should skip non-port keys', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.env'),
      'NODE_ENV=production\nDEBUG=true\nPORT=3000\n',
    );
    const ports = await detectFromDotenv(tmpDir);
    expect(ports.length).toBe(1);
    expect(ports[0].port).toBe(3000);
  });
});
