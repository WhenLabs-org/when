# @whenlabs/vow

## 1.0.0

### Major Changes

- da2bccd: Trim vow: drop the LLM-based policy parser and command bloat.

  Policy is now **deterministic**. `.vow.yml` accepts the same
  `allow`/`deny`/`warn`/`min_confidence` structure as `.vow.json` (parsed
  via plain YAML — no Claude API calls). Cargo and pip resolvers are
  retained; this release does not narrow ecosystem scope.

  Removed:

  - `src/policy/parser.ts` (LLM-based parser) + `src/policy/cache.ts`
    - `src/policy/lockfile.ts` (the offline lockfile existed only to
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

### Patch Changes

- 4360845: Post-trim cleanup: sync READMEs with the actual command surface, drop a dead `chokidar` dep, and fix stale's summary `passed` count.

  - **READMEs rewritten** for the 5 trimmed tools so they match what the CLI actually ships. Removed references to commands and flags that no longer exist (`vow fix|hook|audit|diff|policy`, `vow --offline|--api-key|ANTHROPIC_API_KEY`; `stale fix|watch`, `stale --deep`, `STALE_AI_KEY`, SARIF format; `aware watch|validate|doctor|add`, `--exit-code`; `envalid onboard|hook|export|watch|fix|migrate`, plugins, secret providers, framework adapters). Documented the flags each command actually accepts today (e.g. `aware diff --check|--json|--target|--quiet`, `vow check --ignore`).
  - **aware**: removed unused `chokidar` dependency (carried over from the dropped `aware watch` command — `grep chokidar src/` had zero hits).
  - **stale**: fixed `summary.passed` going negative on reports with many issues. `buildSummary` was computing `totalChecks - errors - warnings - infos`, where `totalChecks` was per (doc × analyzer) but issues are per finding, so a heavy report trivially overflowed it. `totalChecks` now counts analyzers run, and `passed` counts analyzers whose category produced zero issues. Per-category `passed` is now `1` when that analyzer ran and produced no issues, `0` otherwise. Test fixture + snapshot updated for the post-trim DriftCategory set.
  - **vow**: deleted `docs/workflows/` — the three example workflow YAMLs and their README referenced `vow check --offline`, `vow diff`, `vow policy compile`, `ANTHROPIC_API_KEY`, and the archived `whenlabs-org/vow@v1` composite action, none of which exist anymore.

## 0.2.1

### Patch Changes

- aa843ca: Republish via pnpm so `workspace:^` / stale `@whenlabs/core` ranges get rewritten to concrete versions. Previous tarballs for berth/envalid/stale shipped with literal `workspace:^` in `dependencies` (EUNSUPPORTEDPROTOCOL on npm install); aware/vow shipped with `@whenlabs/core@^0.1.0` which doesn't resolve against core@1.0.0.
