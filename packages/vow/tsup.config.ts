import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['esm'],
  clean: true,
  splitting: true,
  noExternal: ['spdx-license-ids', 'spdx-license-list'],
});
