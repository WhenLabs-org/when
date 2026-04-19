import type { StackItem } from "../types.js";
import { parsePackageJson, getDepVersion } from "../utils/parsers.js";
import { fileExists } from "../utils/fs.js";
import { hasDep } from "./utils.js";
import * as path from "node:path";
import fg from "fast-glob";

export async function detectBundler(projectRoot: string): Promise<StackItem | null> {
  const pkg = await parsePackageJson(projectRoot);

  // Turbopack — detected via Next.js --turbo flag in scripts
  if (pkg) {
    const scripts = { ...pkg.scripts } as Record<string, string>;
    const usesTurbo = Object.values(scripts).some((s) => s?.includes("--turbo") || s?.includes("--turbopack"));
    if (usesTurbo) {
      return {
        name: "turbopack",
        version: null,
        variant: null,
        confidence: 0.95,
        detectedFrom: "package.json scripts",
      };
    }
  }

  // Vite — config file takes priority over just being a dep
  const viteConfigs = await fg("vite.config.*", { cwd: projectRoot, onlyFiles: true }).catch(() => []);
  if (viteConfigs.length > 0 && pkg) {
    return {
      name: "vite",
      version: getDepVersion(pkg, "vite"),
      variant: null,
      confidence: 0.95,
      detectedFrom: viteConfigs[0] ?? "vite.config.*",
    };
  }

  // esbuild — config or direct dep usage
  if (pkg && hasDep(pkg, "esbuild")) {
    return {
      name: "esbuild",
      version: getDepVersion(pkg, "esbuild"),
      variant: null,
      confidence: 0.85,
      detectedFrom: "package.json",
    };
  }

  // tsup (uses esbuild under the hood)
  if (pkg && hasDep(pkg, "tsup")) {
    return {
      name: "tsup",
      version: getDepVersion(pkg, "tsup"),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // SWC
  if (pkg && (hasDep(pkg, "@swc/core") || hasDep(pkg, "@swc/cli"))) {
    const version = getDepVersion(pkg, "@swc/core") ?? getDepVersion(pkg, "@swc/cli");
    return {
      name: "swc",
      version,
      variant: null,
      confidence: 0.85,
      detectedFrom: "package.json",
    };
  }

  // Rollup
  const rollupConfigs = await fg("rollup.config.*", { cwd: projectRoot, onlyFiles: true }).catch(() => []);
  if (rollupConfigs.length > 0) {
    return {
      name: "rollup",
      version: pkg ? getDepVersion(pkg, "rollup") : null,
      variant: null,
      confidence: 0.90,
      detectedFrom: rollupConfigs[0] ?? "rollup.config.*",
    };
  }

  // Webpack
  const webpackConfigs = await fg("webpack.config.*", { cwd: projectRoot, onlyFiles: true }).catch(() => []);
  if (webpackConfigs.length > 0) {
    return {
      name: "webpack",
      version: pkg ? getDepVersion(pkg, "webpack") : null,
      variant: null,
      confidence: 0.90,
      detectedFrom: webpackConfigs[0] ?? "webpack.config.*",
    };
  }
  if (pkg && hasDep(pkg, "webpack")) {
    return {
      name: "webpack",
      version: getDepVersion(pkg, "webpack"),
      variant: null,
      confidence: 0.80,
      detectedFrom: "package.json",
    };
  }

  // Parcel
  if (pkg && hasDep(pkg, "parcel")) {
    return {
      name: "parcel",
      version: getDepVersion(pkg, "parcel"),
      variant: null,
      confidence: 0.85,
      detectedFrom: "package.json",
    };
  }

  return null;
}
