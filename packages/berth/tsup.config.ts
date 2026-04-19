import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    clean: true,
    shims: true,
    banner: { js: '#!/usr/bin/env node' },
    target: 'node18',
    splitting: false,
  },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: false,
    shims: true,
    target: 'node18',
    splitting: false,
  },
]);
