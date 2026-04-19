import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadConfig, CONFIG_FILENAME, WhenlabsConfig } from '../config/whenlabs-config.js';

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

function readExistingToolConfigs(cwd: string): WhenlabsConfig {
  const config: WhenlabsConfig = {};

  // Read .stale.yml if it exists — grab known fields
  const stalePath = resolve(cwd, '.stale.yml');
  if (existsSync(stalePath)) {
    try {
      const raw = readFileSync(stalePath, 'utf-8');
      const parsed = parse(raw);
      config.stale = {
        ignore: Array.isArray(parsed?.ignore) ? parsed.ignore : undefined,
        deep: typeof parsed?.deep === 'boolean' ? parsed.deep : undefined,
      };
    } catch {
      config.stale = {};
    }
  }

  // Read .vow.json if it exists
  const vowPath = resolve(cwd, '.vow.json');
  if (existsSync(vowPath)) {
    try {
      const vow = JSON.parse(readFileSync(vowPath, 'utf-8'));
      config.vow = {
        policy: typeof vow.policy === 'string' ? vow.policy : undefined,
        production_only: typeof vow.production_only === 'boolean' ? vow.production_only : undefined,
      };
    } catch { /* skip */ }
  }

  // Read .env.schema if it exists
  const schemaPath = resolve(cwd, '.env.schema');
  if (existsSync(schemaPath)) {
    config.envalid = { schema: '.env.schema' };
  }

  return config;
}

function generateDefaultConfig(cwd: string): WhenlabsConfig {
  const base = readExistingToolConfigs(cwd);

  return {
    stale: base.stale ?? {},
    envalid: base.envalid ?? {},
    vow: base.vow ?? {},
    berth: {},
    aware: {},
    velocity: {},
  };
}

function validateConfig(config: WhenlabsConfig): string[] {
  const errors: string[] = [];

  if (config.stale !== undefined && typeof config.stale !== 'object') {
    errors.push('stale: must be an object');
  }
  if (config.stale?.ignore !== undefined && !Array.isArray(config.stale.ignore)) {
    errors.push('stale.ignore: must be an array of strings');
  }
  if (config.stale?.deep !== undefined && typeof config.stale.deep !== 'boolean') {
    errors.push('stale.deep: must be a boolean');
  }

  if (config.envalid !== undefined && typeof config.envalid !== 'object') {
    errors.push('envalid: must be an object');
  }
  if (config.envalid?.schema !== undefined && typeof config.envalid.schema !== 'string') {
    errors.push('envalid.schema: must be a string');
  }
  if (config.envalid?.environments !== undefined && !Array.isArray(config.envalid.environments)) {
    errors.push('envalid.environments: must be an array of strings');
  }

  if (config.vow !== undefined && typeof config.vow !== 'object') {
    errors.push('vow: must be an object');
  }
  if (config.vow?.policy !== undefined && typeof config.vow.policy !== 'string') {
    errors.push('vow.policy: must be a string');
  }
  if (config.vow?.production_only !== undefined && typeof config.vow.production_only !== 'boolean') {
    errors.push('vow.production_only: must be a boolean');
  }

  if (config.berth !== undefined && typeof config.berth !== 'object') {
    errors.push('berth: must be an object');
  }
  if (config.berth?.ports !== undefined) {
    if (typeof config.berth.ports !== 'object' || Array.isArray(config.berth.ports)) {
      errors.push('berth.ports: must be a key/value map of port names to numbers');
    } else {
      for (const [k, v] of Object.entries(config.berth.ports)) {
        if (typeof v !== 'number') errors.push(`berth.ports.${k}: must be a number`);
      }
    }
  }

  if (config.aware !== undefined && typeof config.aware !== 'object') {
    errors.push('aware: must be an object');
  }
  if (config.aware?.targets !== undefined && !Array.isArray(config.aware.targets)) {
    errors.push('aware.targets: must be an array of strings');
  }

  if (config.velocity !== undefined && typeof config.velocity !== 'object') {
    errors.push('velocity: must be an object');
  }
  if (config.velocity?.project !== undefined && typeof config.velocity.project !== 'string') {
    errors.push('velocity.project: must be a string');
  }

  return errors;
}

export function createConfigCommand(): Command {
  const cmd = new Command('config');
  cmd.description('Manage unified .whenlabs.yml project config');

  // `when config` — show current config
  cmd.action(() => {
    const cwd = process.cwd();
    const configPath = resolve(cwd, CONFIG_FILENAME);

    console.log('');
    console.log(colorize('  when config', c.bold, c.cyan));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));

    if (!existsSync(configPath)) {
      console.log(`  ${colorize('-', c.dim)}  No ${colorize(CONFIG_FILENAME, c.bold)} found`);
      console.log(`  ${colorize('•', c.dim)} Run ${colorize('when config init', c.bold)} to generate one`);
      console.log('');
      return;
    }

    const raw = readFileSync(configPath, 'utf-8');
    console.log(`  ${colorize(configPath, c.dim)}`);
    console.log('');
    for (const line of raw.split('\n')) {
      console.log(`  ${line}`);
    }
  });

  // `when config init` — generate .whenlabs.yml
  const initCmd = new Command('init');
  initCmd.description(`Generate ${CONFIG_FILENAME} from existing tool configs`);
  initCmd.option('--force', 'Overwrite existing config');
  initCmd.action((options: { force?: boolean }) => {
    const cwd = process.cwd();
    const configPath = resolve(cwd, CONFIG_FILENAME);

    console.log('');
    console.log(colorize('  when config init', c.bold, c.cyan));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));

    if (existsSync(configPath) && !options.force) {
      console.log(`  ${colorize('-', c.dim)}  ${colorize(CONFIG_FILENAME, c.bold)} already exists — use ${colorize('--force', c.bold)} to overwrite`);
      console.log('');
      return;
    }

    const config = generateDefaultConfig(cwd);
    const yaml = stringify(config, { lineWidth: 0 });
    writeFileSync(configPath, yaml, 'utf-8');

    console.log(`  ${colorize('+', c.green)}  Created ${colorize(CONFIG_FILENAME, c.bold)}`);
    console.log('');
    for (const line of yaml.split('\n')) {
      if (line.trim()) console.log(`  ${colorize(line, c.dim)}`);
    }
    console.log('');
  });

  // `when config validate` — validate config structure
  const validateCmd = new Command('validate');
  validateCmd.description(`Validate ${CONFIG_FILENAME} structure`);
  validateCmd.action(() => {
    const cwd = process.cwd();
    const configPath = resolve(cwd, CONFIG_FILENAME);

    console.log('');
    console.log(colorize('  when config validate', c.bold, c.cyan));
    console.log(colorize('  ─────────────────────────────────────────', c.dim));

    if (!existsSync(configPath)) {
      console.log(`  ${colorize('-', c.dim)}  No ${colorize(CONFIG_FILENAME, c.bold)} found — nothing to validate`);
      console.log('');
      return;
    }

    const config = loadConfig(cwd);
    if (!config) {
      console.log(`  ${colorize('!', c.yellow)}  Could not parse ${colorize(CONFIG_FILENAME, c.bold)} — invalid YAML`);
      console.log('');
      process.exitCode = 1;
      return;
    }

    const errors = validateConfig(config);
    if (errors.length === 0) {
      console.log(`  ${colorize('✓', c.green)}  ${colorize(CONFIG_FILENAME, c.bold)} is valid`);
    } else {
      for (const err of errors) {
        console.log(`  ${colorize('✗', c.red)}  ${err}`);
      }
      process.exitCode = 1;
    }
    console.log('');
  });

  cmd.addCommand(initCmd);
  cmd.addCommand(validateCmd);

  return cmd;
}
