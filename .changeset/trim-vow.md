---
"@whenlabs/vow": major
---

Trim vow: drop the LLM-based policy parser and command bloat.

Policy is now **deterministic**. `.vow.yml` accepts the same
`allow`/`deny`/`warn`/`min_confidence` structure as `.vow.json` (parsed
via plain YAML — no Claude API calls). Cargo and pip resolvers are
retained; this release does not narrow ecosystem scope.

Removed:
  - `src/policy/parser.ts` (LLM-based parser) + `src/policy/cache.ts`
    + `src/policy/lockfile.ts` (the offline lockfile existed only to
    skip the LLM call — no longer needed)
  - commands: `fix`, `audit`, `diff`, `hook`, `policy` (compile/status)
  - reporters: `audit` (HTML), `diff` (PR markdown), `sarif`
  - `src/diff/engine.ts` and related types
  - `@anthropic-ai/sdk` dep
  - `--api-key`, `--offline`, `--fail-on` lockfile-aware flag handling
    from `check`

Added:
  - `loadYamlPolicy()` — parses structured `.vow.yml` the same way as
    `.vow.json`. The `.vow.yml` template emitted by `vow init` now
    uses the structured shape, not plain English.

Kept: `scan`, `check`, `tree`, `export`, `attribution`, `sbom`, `init`.
Library exports for graph/walker/SPDX/license-db, `createTool`, the
evaluator.

Major version bump.
