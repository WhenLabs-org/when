import * as path from "node:path";
import type { StackItem } from "../types.js";
import { fileExists } from "../utils/fs.js";

export async function detectDeployment(projectRoot: string): Promise<StackItem | null> {
  // Vercel
  if (
    (await fileExists(path.join(projectRoot, "vercel.json"))) ||
    (await fileExists(path.join(projectRoot, ".vercel")))
  ) {
    return {
      name: "vercel",
      version: null,
      variant: null,
      confidence: 0.95,
      detectedFrom: "vercel.json",
    };
  }

  // Netlify
  if (await fileExists(path.join(projectRoot, "netlify.toml"))) {
    return {
      name: "netlify",
      version: null,
      variant: null,
      confidence: 0.95,
      detectedFrom: "netlify.toml",
    };
  }

  // Fly.io
  if (await fileExists(path.join(projectRoot, "fly.toml"))) {
    return {
      name: "fly",
      version: null,
      variant: null,
      confidence: 0.95,
      detectedFrom: "fly.toml",
    };
  }

  // Render
  if (await fileExists(path.join(projectRoot, "render.yaml"))) {
    return {
      name: "render",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "render.yaml",
    };
  }

  // Railway
  if (
    (await fileExists(path.join(projectRoot, "railway.json"))) ||
    (await fileExists(path.join(projectRoot, "railway.toml")))
  ) {
    return {
      name: "railway",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "railway.json",
    };
  }

  // Dockerfile (low priority)
  if (
    (await fileExists(path.join(projectRoot, "Dockerfile"))) ||
    (await fileExists(path.join(projectRoot, "dockerfile")))
  ) {
    return {
      name: "docker",
      version: null,
      variant: null,
      confidence: 0.70,
      detectedFrom: "Dockerfile",
    };
  }

  return null;
}
