import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { reassignPort } from '../../src/resolver/actions.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portmap-actions-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('reassignPort', () => {
  it('should update PORT= in .env file', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'PORT=3000\nNODE_ENV=dev\n');
    const result = await reassignPort(tmpDir, 3000, 3001);
    expect(result.filesModified.length).toBe(1);

    const content = await fs.readFile(path.join(tmpDir, '.env'), 'utf-8');
    expect(content).toContain('PORT=3001');
    expect(content).toContain('NODE_ENV=dev');
  });

  it('should update port in docker-compose.yml', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'docker-compose.yml'),
      'services:\n  db:\n    ports:\n      - "5432:5432"\n',
    );
    const result = await reassignPort(tmpDir, 5432, 5433);
    expect(result.filesModified.length).toBe(1);

    const content = await fs.readFile(path.join(tmpDir, 'docker-compose.yml'), 'utf-8');
    expect(content).toContain('5433:5432');
  });

  it('should update --port in package.json scripts', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'vite --port 3000' } }),
    );
    const result = await reassignPort(tmpDir, 3000, 3001);
    expect(result.filesModified.length).toBe(1);

    const content = await fs.readFile(path.join(tmpDir, 'package.json'), 'utf-8');
    expect(content).toContain('--port 3001');
  });

  it('should not modify files that do not contain the port', async () => {
    await fs.writeFile(path.join(tmpDir, '.env'), 'PORT=8080\n');
    const result = await reassignPort(tmpDir, 3000, 3001);
    expect(result.filesModified.length).toBe(0);
  });

  it('should update port in URL values', async () => {
    await fs.writeFile(
      path.join(tmpDir, '.env'),
      'DATABASE_URL=postgres://localhost:5432/mydb\n',
    );
    const result = await reassignPort(tmpDir, 5432, 5433);
    expect(result.filesModified.length).toBe(1);

    const content = await fs.readFile(path.join(tmpDir, '.env'), 'utf-8');
    expect(content).toContain('localhost:5433');
  });
});
