import type { BerthConfig, BerthConfigPortEntry } from '../types.js';
import { isValidPort } from '../utils/ports.js';

export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

function fail(path: string, msg: string, filePath?: string): never {
  throw new ConfigValidationError(`${path}: ${msg}`, filePath);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validatePortEntry(v: unknown, path: string, filePath?: string): BerthConfigPortEntry {
  if (typeof v === 'number') {
    if (!isValidPort(v)) fail(path, `port must be 1-65535, got ${v}`, filePath);
    return { port: v };
  }
  if (isPlainObject(v)) {
    const port = v.port;
    if (typeof port !== 'number' || !isValidPort(port)) {
      fail(path + '.port', `must be a valid port (1-65535)`, filePath);
    }
    const entry: BerthConfigPortEntry = { port: port as number };
    if (v.required !== undefined) {
      if (typeof v.required !== 'boolean') fail(path + '.required', 'must be boolean', filePath);
      entry.required = v.required;
    }
    if (v.description !== undefined) {
      if (typeof v.description !== 'string') fail(path + '.description', 'must be string', filePath);
      entry.description = v.description;
    }
    return entry;
  }
  fail(path, 'must be a number or { port, required?, description? }', filePath);
}

export function validateConfig(raw: unknown, filePath?: string): BerthConfig {
  if (!isPlainObject(raw)) {
    throw new ConfigValidationError('config must be an object', filePath);
  }

  const result: BerthConfig = {};

  if (raw.projectName !== undefined) {
    if (typeof raw.projectName !== 'string') fail('projectName', 'must be string', filePath);
    result.projectName = raw.projectName;
  }

  if (raw.ports !== undefined) {
    if (!isPlainObject(raw.ports)) fail('ports', 'must be an object', filePath);
    const ports: Record<string, number | BerthConfigPortEntry> = {};
    for (const [name, value] of Object.entries(raw.ports)) {
      const entry = validatePortEntry(value, `ports.${name}`, filePath);
      ports[name] = entry.required || entry.description ? entry : entry.port;
    }
    result.ports = ports;
  }

  if (raw.aliases !== undefined) {
    if (!isPlainObject(raw.aliases)) fail('aliases', 'must be an object', filePath);
    const aliases: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.aliases)) {
      if (typeof v !== 'string') fail(`aliases.${k}`, 'must be string', filePath);
      aliases[k] = v;
    }
    result.aliases = aliases;
  }

  if (raw.reservedRanges !== undefined) {
    if (!Array.isArray(raw.reservedRanges)) fail('reservedRanges', 'must be an array', filePath);
    result.reservedRanges = raw.reservedRanges.map((r, i) => {
      if (!isPlainObject(r)) fail(`reservedRanges[${i}]`, 'must be an object', filePath);
      const from = r.from, to = r.to;
      if (typeof from !== 'number' || !isValidPort(from)) {
        fail(`reservedRanges[${i}].from`, 'must be a valid port', filePath);
      }
      if (typeof to !== 'number' || !isValidPort(to)) {
        fail(`reservedRanges[${i}].to`, 'must be a valid port', filePath);
      }
      if (from > to) fail(`reservedRanges[${i}]`, 'from must be <= to', filePath);
      const entry: { from: number; to: number; reason?: string } = {
        from: from as number,
        to: to as number,
      };
      if (r.reason !== undefined) {
        if (typeof r.reason !== 'string') fail(`reservedRanges[${i}].reason`, 'must be string', filePath);
        entry.reason = r.reason;
      }
      return entry;
    });
  }

  if (raw.frameworks !== undefined) {
    if (!isPlainObject(raw.frameworks)) fail('frameworks', 'must be an object', filePath);
    const fw = raw.frameworks;
    const out: NonNullable<BerthConfig['frameworks']> = {};
    if (fw.disable !== undefined) {
      if (!Array.isArray(fw.disable)) fail('frameworks.disable', 'must be an array of strings', filePath);
      for (const [i, name] of fw.disable.entries()) {
        if (typeof name !== 'string') fail(`frameworks.disable[${i}]`, 'must be string', filePath);
      }
      out.disable = fw.disable as string[];
    }
    if (fw.override !== undefined) {
      if (!isPlainObject(fw.override)) fail('frameworks.override', 'must be an object', filePath);
      const override: Record<string, number> = {};
      for (const [k, v] of Object.entries(fw.override)) {
        if (typeof v !== 'number' || !isValidPort(v)) {
          fail(`frameworks.override.${k}`, 'must be a valid port', filePath);
        }
        override[k] = v;
      }
      out.override = override;
    }
    result.frameworks = out;
  }

  if (raw.plugins !== undefined) {
    if (!Array.isArray(raw.plugins)) fail('plugins', 'must be an array of strings', filePath);
    for (const [i, p] of raw.plugins.entries()) {
      if (typeof p !== 'string') fail(`plugins[${i}]`, 'must be string', filePath);
    }
    result.plugins = raw.plugins as string[];
  }

  if (raw.extends !== undefined) {
    if (typeof raw.extends !== 'string') fail('extends', 'must be string', filePath);
    result.extends = raw.extends;
  }

  if (raw.apiVersion !== undefined) {
    if (raw.apiVersion !== 1) fail('apiVersion', 'only 1 is supported', filePath);
    result.apiVersion = 1;
  }

  return result;
}
