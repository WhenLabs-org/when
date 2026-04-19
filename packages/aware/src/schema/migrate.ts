import { SCHEMA_VERSION } from "../constants.js";
import type { AwareConfig } from "../types.js";
import type { AwareConfigV1 } from "./schema-v1.js";

/**
 * Migrate a parsed `.aware.json` payload of any known version up to the
 * current schema.
 *
 * The dispatch walks version-by-version (v1 → v2 → …) so each migrator
 * only needs to handle one step. That keeps future migrations cheap to
 * add without touching earlier code paths.
 *
 * Throws on:
 *   - non-object input (not a config file at all)
 *   - input that lacks the minimum v1 shape (defensive against corrupted files)
 *   - schema version newer than this CLI supports
 */
export function migrate(raw: unknown): {
  config: AwareConfig;
  migrated: boolean;
  fromVersion: number;
} {
  if (!isObject(raw)) {
    throw new Error("Invalid config: expected a JSON object");
  }

  const fromVersion = detectVersion(raw);

  let current: unknown = raw;
  let migrated = false;
  let version = fromVersion;

  while (version < SCHEMA_VERSION) {
    if (version === 1) {
      current = migrateV1ToV2(current as AwareConfigV1);
      version = 2;
      migrated = true;
      continue;
    }
    // Unknown intermediate — stop rather than risk corrupting data.
    break;
  }

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Config schema v${version} is newer than this aware CLI supports (v${SCHEMA_VERSION}). Upgrade aware.`,
    );
  }

  return {
    config: current as AwareConfig,
    migrated,
    fromVersion,
  };
}

/**
 * Infer the schema version of a raw payload. Trusts an explicit `version`
 * field; otherwise falls back to a minimal shape check for v1
 * (pre-`version`-field files). Anything else throws so callers don't
 * accidentally migrate garbage.
 */
function detectVersion(raw: Record<string, unknown>): number {
  if (typeof raw.version === "number" && Number.isFinite(raw.version)) {
    return raw.version;
  }
  if (looksLikeV1Shape(raw)) {
    return 1;
  }
  throw new Error(
    "Invalid config: missing `version` field and not recognizable as v1 shape. " +
      "Run `aware init` to recreate, or restore from git history.",
  );
}

function looksLikeV1Shape(raw: Record<string, unknown>): boolean {
  return (
    isObject(raw.project) &&
    isObject(raw.stack) &&
    isObject(raw.targets) &&
    isObject(raw._meta)
  );
}

function migrateV1ToV2(v1: AwareConfigV1): AwareConfig {
  // All v1 fields survive; v2 only adds optional fields. We explicitly
  // initialize `_meta.fileHashes` and `_meta.fragmentVersions` to empty
  // objects (with empty outer key for the single-package case) so
  // downstream code can assume they exist after a migration.
  const meta = v1._meta ?? {
    createdAt: new Date().toISOString(),
    lastSyncedAt: null,
    lastDetectionHash: "",
    awareVersion: "0.0.0",
  };

  // Spread with an explicit copy so we don't alias into the caller's object.
  return {
    ...(v1 as unknown as AwareConfig),
    version: 2,
    _meta: {
      ...meta,
      fileHashes: {},
      fragmentVersions: {},
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
