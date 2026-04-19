import { readFileSync } from "node:fs";
import YAML from "yaml";
import { migrationFile, type MigrationFile } from "./types.js";
import { EnvalidError } from "../errors.js";
import { createHash } from "node:crypto";
import { basename } from "node:path";

export function parseMigrationFile(filePath: string): {
  migration: MigrationFile;
  hash: string;
  id: string;
} {
  const content = readFileSync(filePath, "utf-8");
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  let raw: unknown;
  try {
    raw = YAML.parse(content);
  } catch (err) {
    throw new EnvalidError(
      `Failed to parse migration YAML: ${(err as Error).message}`,
      "MIGRATE_PARSE",
    );
  }
  const result = migrationFile.safeParse(raw);
  if (!result.success) {
    throw new EnvalidError(
      `Invalid migration file: ${result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      "MIGRATE_PARSE",
    );
  }
  const id = result.data.id ?? basename(filePath).replace(/\.ya?ml$/, "");
  return { migration: result.data, hash, id };
}
