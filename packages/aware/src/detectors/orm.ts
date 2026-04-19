import * as path from "node:path";
import type { StackItem } from "../types.js";
import { parsePackageJson, getDepVersion } from "../utils/parsers.js";
import { readFile } from "../utils/fs.js";
import { hasDep } from "./utils.js";

export async function detectOrm(projectRoot: string): Promise<StackItem | null> {
  const pkg = await parsePackageJson(projectRoot);

  if (pkg) {
    // Prisma
    if (hasDep(pkg, "prisma") || hasDep(pkg, "@prisma/client")) {
      return {
        name: "prisma",
        version: getDepVersion(pkg, "prisma") ?? getDepVersion(pkg, "@prisma/client"),
        variant: null,
        confidence: 0.95,
        detectedFrom: "package.json",
      };
    }

    // Drizzle
    if (hasDep(pkg, "drizzle-orm")) {
      return {
        name: "drizzle",
        version: getDepVersion(pkg, "drizzle-orm"),
        variant: null,
        confidence: 0.95,
        detectedFrom: "package.json",
      };
    }

    // TypeORM
    if (hasDep(pkg, "typeorm")) {
      return {
        name: "typeorm",
        version: getDepVersion(pkg, "typeorm"),
        variant: null,
        confidence: 0.90,
        detectedFrom: "package.json",
      };
    }

    // Kysely
    if (hasDep(pkg, "kysely")) {
      return {
        name: "kysely",
        version: getDepVersion(pkg, "kysely"),
        variant: null,
        confidence: 0.85,
        detectedFrom: "package.json",
      };
    }

    // Mongoose
    if (hasDep(pkg, "mongoose")) {
      return {
        name: "mongoose",
        version: getDepVersion(pkg, "mongoose"),
        variant: null,
        confidence: 0.90,
        detectedFrom: "package.json",
      };
    }

    // Sequelize
    if (hasDep(pkg, "sequelize")) {
      return {
        name: "sequelize",
        version: getDepVersion(pkg, "sequelize"),
        variant: null,
        confidence: 0.85,
        detectedFrom: "package.json",
      };
    }
  }

  // SQLAlchemy (Python)
  const reqContent = await readFile(path.join(projectRoot, "requirements.txt"));
  if (reqContent && reqContent.toLowerCase().includes("sqlalchemy")) {
    return {
      name: "sqlalchemy",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "requirements.txt",
    };
  }

  const pyprojectContent = await readFile(path.join(projectRoot, "pyproject.toml"));
  if (pyprojectContent && pyprojectContent.toLowerCase().includes("sqlalchemy")) {
    return {
      name: "sqlalchemy",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "pyproject.toml",
    };
  }

  return null;
}
