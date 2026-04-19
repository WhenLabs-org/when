import type { StackItem } from "../types.js";
import { parsePackageJson, getDepVersion } from "../utils/parsers.js";
import { hasDep } from "./utils.js";

export async function detectStateManagement(projectRoot: string): Promise<StackItem | null> {
  const pkg = await parsePackageJson(projectRoot);
  if (!pkg) return null;

  // Zustand
  if (hasDep(pkg, "zustand")) {
    return {
      name: "zustand",
      version: getDepVersion(pkg, "zustand"),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Redux Toolkit
  if (hasDep(pkg, "@reduxjs/toolkit")) {
    return {
      name: "redux-toolkit",
      version: getDepVersion(pkg, "@reduxjs/toolkit"),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Jotai
  if (hasDep(pkg, "jotai")) {
    return {
      name: "jotai",
      version: getDepVersion(pkg, "jotai"),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // Recoil
  if (hasDep(pkg, "recoil")) {
    return {
      name: "recoil",
      version: getDepVersion(pkg, "recoil"),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // XState
  if (hasDep(pkg, "xstate")) {
    return {
      name: "xstate",
      version: getDepVersion(pkg, "xstate"),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Pinia (Vue)
  if (hasDep(pkg, "pinia")) {
    return {
      name: "pinia",
      version: getDepVersion(pkg, "pinia"),
      variant: null,
      confidence: 0.95,
      detectedFrom: "package.json",
    };
  }

  // MobX
  if (hasDep(pkg, "mobx")) {
    return {
      name: "mobx",
      version: getDepVersion(pkg, "mobx"),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  // Valtio
  if (hasDep(pkg, "valtio")) {
    return {
      name: "valtio",
      version: getDepVersion(pkg, "valtio"),
      variant: null,
      confidence: 0.90,
      detectedFrom: "package.json",
    };
  }

  return null;
}
