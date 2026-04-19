import { readFileSync, existsSync } from "node:fs";
import * as dotenv from "dotenv";
import { EnvFileNotFoundError } from "../errors.js";

export interface EnvFile {
  path: string;
  variables: Record<string, string>;
}

export function readEnvFile(filePath: string): EnvFile {
  if (!existsSync(filePath)) {
    throw new EnvFileNotFoundError(filePath);
  }
  const content = readFileSync(filePath, "utf-8");
  const variables = dotenv.parse(content);
  return { path: filePath, variables };
}

export function parseEnvString(content: string, path = "<string>"): EnvFile {
  const variables = dotenv.parse(content);
  return { path, variables };
}
