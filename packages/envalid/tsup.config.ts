import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    target: "node20",
    external: ["@aws-sdk/client-secrets-manager"],
    banner: { js: "#!/usr/bin/env node" },
    clean: true,
  },
  {
    entry: {
      index: "src/index.ts",
      "adapters/express": "src/adapters/express.ts",
      "adapters/fastify": "src/adapters/fastify.ts",
      "adapters/nextjs": "src/adapters/nextjs.ts",
      "adapters/nestjs": "src/adapters/nestjs.ts",
      "adapters/vite": "src/adapters/vite.ts",
    },
    format: ["esm"],
    target: "node20",
    external: ["@aws-sdk/client-secrets-manager"],
    sourcemap: true,
    dts: true,
  },
]);
