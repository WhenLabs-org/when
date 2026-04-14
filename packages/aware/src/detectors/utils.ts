import fg from "fast-glob";
import type { PackageJson } from "../types.js";

export function hasDep(pkg: PackageJson, name: string): boolean {
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export async function globFiles(projectRoot: string, pattern: string): Promise<string[]> {
  return fg(pattern, {
    cwd: projectRoot,
    dot: false,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
  });
}
