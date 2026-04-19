import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringify } from 'yaml';
import { loadConfig } from '../config/whenlabs-config.js';

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

export function createEjectCommand(): Command {
  const cmd = new Command('eject');
  cmd.description('Write each tool section of .whenlabs.yml back to its native config format');
  cmd.option('--force', 'Overwrite existing files without prompting');

  cmd.action((options: { force?: boolean }) => {
    const cwd = process.cwd();

    console.log('');
    console.log(colorize('  when eject', c.bold, c.cyan));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));

    const config = loadConfig(cwd);
    if (!config) {
      console.log(`  ${colorize('!', c.yellow)}  No ${colorize('.whenlabs.yml', c.bold)} found — nothing to eject`);
      console.log(`  ${colorize('•', c.dim)} Run ${colorize('when config init', c.bold)} to generate one first`);
      console.log('');
      return;
    }

    let ejected = 0;
    let skipped = 0;

    // stale → .stale.yml
    if (config.stale && Object.keys(config.stale).length > 0) {
      const dest = resolve(cwd, '.stale.yml');
      if (existsSync(dest) && !options.force) {
        console.log(`  ${colorize('!', c.yellow)}  ${colorize('.stale.yml', c.bold)} already exists — use ${colorize('--force', c.bold)} to overwrite`);
        skipped++;
      } else {
        const yaml = stringify(config.stale, { lineWidth: 0 });
        writeFileSync(dest, yaml, 'utf-8');
        console.log(`  ${colorize('+', c.green)}  Wrote ${colorize('.stale.yml', c.bold)}`);
        ejected++;
      }
    } else if (config.stale !== undefined) {
      console.log(`  ${colorize('-', c.dim)}  stale: empty config — skipping .stale.yml`);
    }

    // vow → .vow.json
    if (config.vow && Object.keys(config.vow).length > 0) {
      const dest = resolve(cwd, '.vow.json');
      if (existsSync(dest) && !options.force) {
        console.log(`  ${colorize('!', c.yellow)}  ${colorize('.vow.json', c.bold)} already exists — use ${colorize('--force', c.bold)} to overwrite`);
        skipped++;
      } else {
        writeFileSync(dest, JSON.stringify(config.vow, null, 2) + '\n', 'utf-8');
        console.log(`  ${colorize('+', c.green)}  Wrote ${colorize('.vow.json', c.bold)}`);
        ejected++;
      }
    } else if (config.vow !== undefined) {
      console.log(`  ${colorize('-', c.dim)}  vow: empty config — skipping .vow.json`);
    }

    // envalid → copy schema file
    if (config.envalid?.schema) {
      const src = resolve(cwd, config.envalid.schema);
      const dest = resolve(cwd, '.env.schema');
      const isSamePath = resolve(src) === resolve(dest);

      if (isSamePath) {
        console.log(`  ${colorize('-', c.dim)}  envalid.schema already points to ${colorize('.env.schema', c.bold)}`);
      } else if (!existsSync(src)) {
        console.log(`  ${colorize('!', c.yellow)}  envalid.schema source ${colorize(config.envalid.schema, c.bold)} not found — skipping`);
        skipped++;
      } else if (existsSync(dest) && !options.force) {
        console.log(`  ${colorize('!', c.yellow)}  ${colorize('.env.schema', c.bold)} already exists — use ${colorize('--force', c.bold)} to overwrite`);
        skipped++;
      } else {
        copyFileSync(src, dest);
        console.log(`  ${colorize('+', c.green)}  Copied ${colorize(config.envalid.schema, c.bold)} → ${colorize('.env.schema', c.bold)}`);
        ejected++;
      }
    }

    // berth — no standalone config file
    if (config.berth !== undefined) {
      const portCount = config.berth.ports ? Object.keys(config.berth.ports).length : 0;
      if (portCount > 0) {
        console.log(`  ${colorize('•', c.dim)}  berth: ${portCount} port(s) configured — berth has no standalone config file, managed via ${colorize('.whenlabs.yml', c.bold)}`);
      } else {
        console.log(`  ${colorize('-', c.dim)}  berth: no standalone config file`);
      }
    }

    console.log('');

    if (ejected > 0) {
      console.log(`  ${colorize('✓', c.green)}  Ejected ${colorize(String(ejected), c.bold)} file(s)`);
    }
    if (skipped > 0) {
      console.log(`  ${colorize('!', c.yellow)}  Skipped ${colorize(String(skipped), c.bold)} file(s) — run with ${colorize('--force', c.bold)} to overwrite`);
    }
    if (ejected === 0 && skipped === 0) {
      console.log(`  ${colorize('-', c.dim)}  Nothing to eject`);
    }

    console.log('');
  });

  return cmd;
}
