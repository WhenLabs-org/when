import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function colorize(text: string, ...codes: string[]): string {
  return codes.join('') + text + c.reset;
}

function parseVersion(v: string): number[] {
  return v.trim().split('.').map(Number);
}

function versionGte(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return true; // equal
}

export function createUpgradeCommand(): Command {
  const cmd = new Command('upgrade');
  cmd.description('Upgrade @whenlabs/when to the latest version');

  cmd.action(async () => {
    console.log('');
    console.log(colorize('  when upgrade', c.bold, c.cyan));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));

    // Read current version from package.json
    const pkgPath = resolve(__dirname, '..', '..', 'package.json');
    let current: string;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      current = pkg.version;
    } catch {
      console.log(`  ${colorize('!', c.red)}  Could not read current version`);
      console.log('');
      process.exitCode = 1;
      return;
    }

    console.log(`  ${colorize('current', c.dim)}  ${colorize(current, c.bold)}`);

    // Fetch latest version from npm
    let latest: string;
    try {
      latest = execSync('npm view @whenlabs/when version', { encoding: 'utf-8' }).trim();
    } catch {
      console.log(`  ${colorize('!', c.yellow)}  Could not reach npm registry — check your network connection`);
      console.log('');
      process.exitCode = 1;
      return;
    }

    console.log(`  ${colorize('latest', c.dim)}   ${colorize(latest, c.bold)}`);
    console.log('');

    if (versionGte(current, latest)) {
      console.log(`  ${colorize('✓', c.green)}  Already up to date`);
      console.log('');
      return;
    }

    console.log(`  ${colorize('↑', c.yellow)}  Upgrade available: ${colorize(current, c.dim)} → ${colorize(latest, c.green + c.bold)}`);
    console.log(`  ${colorize('•', c.dim)} Running: ${colorize('npm install -g @whenlabs/when@latest', c.bold)}`);
    console.log('');

    try {
      execSync('npm install -g @whenlabs/when@latest', { stdio: 'inherit' });
      console.log('');
      console.log(`  ${colorize('✓', c.green)}  Upgraded to ${colorize(latest, c.bold)}`);
    } catch {
      console.log(`  ${colorize('✗', c.red)}  Install failed — try running with sudo or check npm permissions`);
      process.exitCode = 1;
    }

    console.log('');
  });

  return cmd;
}
