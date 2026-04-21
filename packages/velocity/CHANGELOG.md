# @whenlabs/velocity-mcp

## 0.1.5

### Patch Changes

- 66f99c1: Expand MCP tool descriptions to cover purpose, when-to-use, side effects, and return shape for all 7 tools (aware_sync, berth_check, envalid_validate, stale_scan, vow_scan, velocity_start_task, velocity_end_task). Improves Glama TDQS scoring and gives agents enough context to call each tool correctly without prior familiarity.

## 0.1.4

### Patch Changes

- e44da02: Bump `better-sqlite3` from `^11.0.0` to `^12.9.0` to pick up node 24 prebuilt binaries. Glama's hosted Docker buildpack uses node 24, and the older version had no prebuild for ABI v137, forcing a source compile that failed on a slim image without `make`/`g++`.
