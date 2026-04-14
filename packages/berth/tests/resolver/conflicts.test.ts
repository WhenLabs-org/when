import { describe, it, expect } from 'vitest';
import { detectConflicts, mergePortInfo } from '../../src/resolver/conflicts.js';
import type { ActivePort, DockerPort, ConfiguredPort } from '../../src/types.js';

const makeActive = (port: number, pid: number, process = 'node'): ActivePort => ({
  port, pid, process, command: process, user: 'user', protocol: 'tcp', address: '0.0.0.0', source: 'lsof',
});

const makeDocker = (port: number, name: string): DockerPort => ({
  port, containerPort: port, containerId: 'abc', containerName: name, image: 'img', protocol: 'tcp', status: 'running',
});

const makeConfigured = (port: number, projectDir: string, projectName?: string): ConfiguredPort => ({
  port, source: 'dotenv', sourceFile: `${projectDir}/.env`, context: `PORT=${port}`,
  projectDir, projectName: projectName ?? projectDir.split('/').pop()!, confidence: 'high',
});

describe('detectConflicts', () => {
  it('should return no conflicts when no overlaps', () => {
    const active = [makeActive(3000, 100)];
    const configured = [makeConfigured(8080, '/proj')];
    const conflicts = detectConflicts(active, [], configured);
    expect(conflicts.length).toBe(0);
  });

  it('should detect active vs configured conflict', () => {
    const active = [makeActive(3000, 100)];
    const configured = [makeConfigured(3000, '/other-proj')];
    const conflicts = detectConflicts(active, [], configured);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].port).toBe(3000);
    expect(conflicts[0].severity).toBe('error');
  });

  it('should detect docker vs configured conflict', () => {
    const docker = [makeDocker(5432, 'my-db')];
    const configured = [makeConfigured(5432, '/proj')];
    const conflicts = detectConflicts([], docker, configured);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].severity).toBe('error');
  });

  it('should detect configured vs configured conflict across projects', () => {
    const configured = [
      makeConfigured(3000, '/proj-a', 'proj-a'),
      makeConfigured(3000, '/proj-b', 'proj-b'),
    ];
    const conflicts = detectConflicts([], [], configured);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].severity).toBe('warning');
  });

  it('should detect active vs docker conflict', () => {
    const active = [makeActive(5432, 100, 'postgres')];
    const docker = [makeDocker(5432, 'my-db')];
    const conflicts = detectConflicts(active, docker, []);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].severity).toBe('error');
  });

  it('should sort errors before warnings', () => {
    const active = [makeActive(3000, 100)];
    const configured = [
      makeConfigured(3000, '/proj-a'),
      makeConfigured(8080, '/proj-a', 'proj-a'),
      makeConfigured(8080, '/proj-b', 'proj-b'),
    ];
    const conflicts = detectConflicts(active, [], configured);
    expect(conflicts.length).toBe(2);
    expect(conflicts[0].severity).toBe('error');
    expect(conflicts[1].severity).toBe('warning');
  });
});

describe('mergePortInfo', () => {
  it('should merge all sources into unified view', () => {
    const active = [makeActive(3000, 100)];
    const docker = [makeDocker(5432, 'db')];
    const configured = [makeConfigured(8080, '/proj')];

    const info = mergePortInfo(active, docker, configured);
    expect(info.length).toBe(3);

    const p3000 = info.find((p) => p.port === 3000);
    expect(p3000!.status).toBe('active');
    expect(p3000!.active).toBeDefined();

    const p5432 = info.find((p) => p.port === 5432);
    expect(p5432!.status).toBe('docker');
    expect(p5432!.docker).toBeDefined();

    const p8080 = info.find((p) => p.port === 8080);
    expect(p8080!.status).toBe('configured');
    expect(p8080!.configured.length).toBe(1);
  });

  it('should sort by port number', () => {
    const info = mergePortInfo(
      [makeActive(8080, 1)],
      [makeDocker(3000, 'x')],
      [makeConfigured(5432, '/p')],
    );
    expect(info.map((p) => p.port)).toEqual([3000, 5432, 8080]);
  });
});
