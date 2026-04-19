import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadPlugins, PluginLoadError } from '../../src/config/plugins.js';
import { DetectorRegistry } from '../../src/detectors/registry.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'berth-plugin-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadPlugins', () => {
  it('loads a relative plugin and lets it register a detector', async () => {
    const configPath = path.join(tmpDir, 'berth.config.mjs');
    await fs.writeFile(configPath, 'export default {};\n');
    const pluginPath = path.join(tmpDir, 'my-plugin.mjs');
    await fs.writeFile(
      pluginPath,
      `export default function plugin(registry) {
  registry.registerConfigured({
    name: 'hello',
    kind: 'configured',
    async detect() { return []; },
  });
}
`,
    );

    const registry = new DetectorRegistry();
    await loadPlugins(['./my-plugin.mjs'], configPath, registry);

    expect(registry.has('hello')).toBe(true);
  });

  it('throws PluginLoadError on missing plugin', async () => {
    const configPath = path.join(tmpDir, 'berth.config.mjs');
    await fs.writeFile(configPath, 'export default {};\n');
    const registry = new DetectorRegistry();

    await expect(loadPlugins(['./nonexistent.js'], configPath, registry)).rejects.toThrow(
      PluginLoadError,
    );
  });

  it('throws when plugin default export is not a function', async () => {
    const configPath = path.join(tmpDir, 'berth.config.mjs');
    await fs.writeFile(configPath, 'export default {};\n');
    const pluginPath = path.join(tmpDir, 'bad-plugin.mjs');
    await fs.writeFile(pluginPath, 'export default { not: "a function" };\n');
    const registry = new DetectorRegistry();

    await expect(loadPlugins(['./bad-plugin.mjs'], configPath, registry)).rejects.toThrow(
      /must be a function/,
    );
  });
});
