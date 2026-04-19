import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import YAML from "yaml";
import type { EnvSchema, GroupSchema, VariableSchema } from "./types.js";
import { parseSchemaString, type ParseSchemaOptions } from "./parser.js";
import { SchemaNotFoundError, SchemaParseError } from "../errors.js";

export interface LoadSchemaOptions extends ParseSchemaOptions {
  /** If set, treat this as the starting working directory. */
  cwd?: string;
}

/**
 * Load a schema from disk, resolving extends/imports recursively. The input
 * schema is first, then `extends` contributes defaults (overridden by current),
 * and `imports` are overlaid last-wins on top. Groups concatenate and dedupe.
 */
export function loadSchema(
  filePath: string,
  options: LoadSchemaOptions = {},
): EnvSchema {
  const absolute = isAbsolute(filePath)
    ? filePath
    : resolve(options.cwd ?? process.cwd(), filePath);
  return loadSchemaInner(absolute, new Set<string>(), options);
}

function loadSchemaInner(
  absPath: string,
  visiting: Set<string>,
  options: ParseSchemaOptions,
): EnvSchema {
  if (!existsSync(absPath)) {
    throw new SchemaNotFoundError(absPath);
  }
  if (visiting.has(absPath)) {
    throw new SchemaParseError(
      `Cyclic schema reference involving ${absPath}`,
    );
  }
  visiting.add(absPath);
  try {
    const content = readFileSync(absPath, "utf-8");
    // Parse the raw document once so we can inspect extends/imports even
    // before the full schema parse (which may fail on e.g. unknown types).
    let raw: { extends?: string | string[]; imports?: string[] };
    try {
      raw = YAML.parse(content) ?? {};
    } catch (err) {
      throw new SchemaParseError(
        `Failed to parse YAML: ${(err as Error).message}`,
      );
    }

    const current = parseSchemaString(content, options);
    const baseDir = dirname(absPath);

    let merged: EnvSchema = { ...current };

    const extendsList = normalizeList(raw.extends);
    if (extendsList.length > 0) {
      // extends = defaults; merge them under the current schema.
      let base: EnvSchema | undefined;
      for (const rel of extendsList) {
        const loaded = loadSchemaInner(
          resolve(baseDir, rel),
          visiting,
          options,
        );
        base = base ? mergeSchemas(base, loaded) : loaded;
      }
      if (base) merged = mergeSchemas(base, merged);
    }

    const importsList = normalizeList(raw.imports);
    for (const rel of importsList) {
      const overlay = loadSchemaInner(
        resolve(baseDir, rel),
        visiting,
        options,
      );
      merged = mergeSchemas(merged, overlay);
    }

    // Strip extends/imports from the flat result.
    const { extends: _e, imports: _i, ...rest } = merged;
    return rest as EnvSchema;
  } finally {
    visiting.delete(absPath);
  }
}

function normalizeList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Merge two schemas. Variables in `overlay` win on conflict. Groups merge by
 * name: variable lists and required_in lists are concatenated and deduped.
 */
export function mergeSchemas(base: EnvSchema, overlay: EnvSchema): EnvSchema {
  const variables: Record<string, VariableSchema> = { ...base.variables };
  for (const [name, v] of Object.entries(overlay.variables)) {
    variables[name] = v;
  }
  const groups: Record<string, GroupSchema> = {};
  const baseGroups = base.groups ?? {};
  const overlayGroups = overlay.groups ?? {};
  for (const name of new Set([
    ...Object.keys(baseGroups),
    ...Object.keys(overlayGroups),
  ])) {
    const b = baseGroups[name];
    const o = overlayGroups[name];
    if (b && o) {
      groups[name] = {
        description: o.description ?? b.description,
        variables: dedupe([...b.variables, ...o.variables]),
        required_in: dedupe([...(b.required_in ?? []), ...(o.required_in ?? [])]),
      };
    } else {
      groups[name] = (b ?? o) as GroupSchema;
    }
  }
  return {
    version: overlay.version || base.version,
    variables,
    ...(Object.keys(groups).length > 0 ? { groups } : {}),
  };
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
