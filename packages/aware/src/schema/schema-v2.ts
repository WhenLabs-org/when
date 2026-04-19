/**
 * v2 is the current schema. Re-exports the live `AwareConfig` so that
 * migrators/callers can import from a version-namespaced module.
 *
 * Schema v2 (Phase 0) is an additive bump over v1:
 *   - `_meta.fileHashes`          — per-target content hash (tamper detection)
 *   - `_meta.fragmentVersions`    — provenance: which fragment@version produced each output
 *   - `conventions.extracted`     — auto-extracted from source scan (Phase 3)
 *   - `extends`, `packages`       — monorepo inheritance + member list (Phase 4)
 *
 * No fields were renamed or removed; v1 files migrate trivially.
 */

export type { AwareConfig as AwareConfigV2 } from "../types.js";
