#!/usr/bin/env node
// Bundles action/index.ts into a single file with all dependencies inlined,
// so the GitHub Action runtime doesn't need to install node_modules and the
// published npm package doesn't have to list @actions/* at runtime.

import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outfile = join(projectRoot, 'dist/action/index.js');

// Wipe the pre-built (tsc) output for the action so there's no stale .js / .d.ts
// pointing at now-external modules.
await rm(join(projectRoot, 'dist/action'), { recursive: true, force: true });

await build({
  entryPoints: [join(projectRoot, 'action/index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  // Keep the shebang-less default — the action is invoked via `node` by the runner.
  banner: { js: '// @whenlabs/stale — GitHub Action bundle (generated)' },
  // Node 20 supports these natively; no polyfill needed.
  external: [],
  logLevel: 'info',
});
