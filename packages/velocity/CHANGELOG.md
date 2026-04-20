# @whenlabs/velocity-mcp

## 0.1.4

### Patch Changes

- e44da02: Bump `better-sqlite3` from `^11.0.0` to `^12.9.0` to pick up node 24 prebuilt binaries. Glama's hosted Docker buildpack uses node 24, and the older version had no prebuild for ABI v137, forcing a source compile that failed on a slim image without `make`/`g++`.
