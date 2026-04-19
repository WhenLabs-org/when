import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', mcp: 'src/mcp/index.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [
    'better-sqlite3',
    '@whenlabs/velocity-mcp',
  ],
  noExternal: [],
});
