import * as path from "node:path";
import type { StackItem } from "../types.js";
import { parsePackageJson, getDepVersion } from "../utils/parsers.js";
import { fileExists } from "../utils/fs.js";
import { hasDep, globFiles } from "./utils.js";

export async function detectApiStyle(projectRoot: string): Promise<StackItem | null> {
  const pkg = await parsePackageJson(projectRoot);

  if (pkg) {
    // tRPC
    if (hasDep(pkg, "@trpc/server") || hasDep(pkg, "@trpc/client") || hasDep(pkg, "@trpc/react-query")) {
      const version = getDepVersion(pkg, "@trpc/server") ?? getDepVersion(pkg, "@trpc/client");
      return {
        name: "trpc",
        version,
        variant: null,
        confidence: 0.95,
        detectedFrom: "package.json",
      };
    }

    // Hono OpenAPI
    if (hasDep(pkg, "@hono/zod-openapi")) {
      return {
        name: "openapi",
        version: getDepVersion(pkg, "@hono/zod-openapi"),
        variant: "hono-zod-openapi",
        confidence: 0.90,
        detectedFrom: "package.json",
      };
    }

    // GraphQL
    if (hasDep(pkg, "graphql")) {
      const variant = hasDep(pkg, "@apollo/server") || hasDep(pkg, "apollo-server")
        ? "apollo"
        : hasDep(pkg, "graphql-yoga")
          ? "yoga"
          : null;
      return {
        name: "graphql",
        version: getDepVersion(pkg, "graphql"),
        variant,
        confidence: 0.90,
        detectedFrom: "package.json",
      };
    }
  }

  // OpenAPI / Swagger files
  const openapiFiles = await globFiles(projectRoot, "{openapi,swagger}.{json,yaml,yml}");
  if (openapiFiles.length > 0) {
    return {
      name: "openapi",
      version: null,
      variant: null,
      confidence: 0.80,
      detectedFrom: openapiFiles[0]!,
    };
  }

  // Fallback: REST (if express or fastify detected but no specific API style above)
  if (pkg && (hasDep(pkg, "express") || hasDep(pkg, "fastify"))) {
    return {
      name: "rest",
      version: null,
      variant: null,
      confidence: 0.50,
      detectedFrom: "package.json",
    };
  }

  return null;
}
