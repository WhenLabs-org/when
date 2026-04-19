import * as path from "node:path";
import type { StackItem } from "../types.js";
import { parseDotenv } from "../utils/parsers.js";
import { readFile, fileExists } from "../utils/fs.js";

export async function detectDatabase(projectRoot: string): Promise<StackItem | null> {
  // 1. Check Prisma schema provider
  const prismaResult = await detectFromPrismaSchema(projectRoot);
  if (prismaResult) return prismaResult;

  // 2. Check .env DATABASE_URL
  const envResult = await detectFromEnv(projectRoot);
  if (envResult) return envResult;

  // 3. Check docker-compose
  const dockerResult = await detectFromDockerCompose(projectRoot);
  if (dockerResult) return dockerResult;

  return null;
}

async function detectFromPrismaSchema(projectRoot: string): Promise<StackItem | null> {
  const schemaPaths = [
    path.join(projectRoot, "prisma", "schema.prisma"),
    path.join(projectRoot, "schema.prisma"),
  ];

  for (const schemaPath of schemaPaths) {
    const content = await readFile(schemaPath);
    if (!content) continue;

    const providerMatch = content.match(/provider\s*=\s*"(\w+)"/);
    if (providerMatch) {
      const provider = providerMatch[1]!.toLowerCase();
      const dbMap: Record<string, string> = {
        postgresql: "postgres",
        postgres: "postgres",
        mysql: "mysql",
        mongodb: "mongodb",
        sqlite: "sqlite",
        sqlserver: "sqlserver",
        cockroachdb: "cockroachdb",
      };
      const name = dbMap[provider] ?? provider;
      return {
        name,
        version: null,
        variant: null,
        confidence: 0.95,
        detectedFrom: "prisma/schema.prisma",
      };
    }
  }

  return null;
}

async function detectFromEnv(projectRoot: string): Promise<StackItem | null> {
  const envFiles = [".env", ".env.local", ".env.development"];

  for (const envFile of envFiles) {
    const envPath = path.join(projectRoot, envFile);
    const env = await parseDotenv(envPath);
    const dbUrl = env.DATABASE_URL ?? env.DB_URL ?? env.MONGODB_URI ?? env.MONGO_URL;

    if (dbUrl) {
      if (dbUrl.startsWith("postgres") || dbUrl.includes("postgresql")) {
        return { name: "postgres", version: null, variant: null, confidence: 0.90, detectedFrom: envFile };
      }
      if (dbUrl.startsWith("mysql")) {
        return { name: "mysql", version: null, variant: null, confidence: 0.90, detectedFrom: envFile };
      }
      if (dbUrl.startsWith("mongodb")) {
        return { name: "mongodb", version: null, variant: null, confidence: 0.90, detectedFrom: envFile };
      }
      if (dbUrl.includes("sqlite") || dbUrl.includes("file:")) {
        return { name: "sqlite", version: null, variant: null, confidence: 0.85, detectedFrom: envFile };
      }
    }
  }

  return null;
}

async function detectFromDockerCompose(projectRoot: string): Promise<StackItem | null> {
  const composeFiles = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

  for (const file of composeFiles) {
    const filePath = path.join(projectRoot, file);
    const content = await readFile(filePath);
    if (!content) continue;

    const lower = content.toLowerCase();
    if (lower.includes("image: postgres") || lower.includes("image: \"postgres")) {
      return { name: "postgres", version: null, variant: null, confidence: 0.80, detectedFrom: file };
    }
    if (lower.includes("image: mysql") || lower.includes("image: \"mysql") || lower.includes("image: mariadb")) {
      return { name: "mysql", version: null, variant: null, confidence: 0.80, detectedFrom: file };
    }
    if (lower.includes("image: mongo") || lower.includes("image: \"mongo")) {
      return { name: "mongodb", version: null, variant: null, confidence: 0.80, detectedFrom: file };
    }
    if (lower.includes("image: redis") || lower.includes("image: \"redis")) {
      return { name: "redis", version: null, variant: null, confidence: 0.80, detectedFrom: file };
    }
  }

  return null;
}
