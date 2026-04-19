import { execFile } from 'node:child_process';
import type { Platform } from '../types.js';

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function getCurrentPlatform(): Platform {
  return process.platform as Platform;
}

export function getActivePortDetector(): 'lsof' | 'netstat' {
  return getCurrentPlatform() === 'win32' ? 'netstat' : 'lsof';
}

let dockerAvailableCache: boolean | null = null;

export async function isDockerAvailable(): Promise<boolean> {
  if (dockerAvailableCache !== null) return dockerAvailableCache;
  try {
    const result = await shellExec('docker', ['info'], { timeout: 5000 });
    dockerAvailableCache = result.exitCode === 0;
  } catch {
    dockerAvailableCache = false;
  }
  return dockerAvailableCache;
}

export function resetDockerCache(): void {
  dockerAvailableCache = null;
}

export function shellExec(
  cmd: string,
  args: string[] = [],
  opts: { timeout?: number } = {},
): Promise<ShellResult> {
  const timeout = opts.timeout ?? 10000;
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && 'code' in error && error.code === 'ENOENT') {
        reject(new Error(`Command not found: ${cmd}`));
        return;
      }
      resolve({
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        exitCode: error ? (typeof (error as any).code === 'number' ? (error as any).code : 1) : 0,
      });
    });
  });
}
