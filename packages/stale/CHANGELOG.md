# @whenlabs/stale

## 1.0.0

### Major Changes

- 8019f9f: Trim stale: drop AI analyzers, fix, watch, sarif.

  Per the audit, stale's AI-powered analyzers (`--deep` / semantic /
  completeness / examples) had real Claude API calls wired up but zero
  test coverage. The `fix` command (580 LOC of auto-rewrite logic) and
  `watch` command (chokidar-based re-scan) both overlap with standard
  linter/IDE workflows.

  Removed:

  - `src/analyzers/ai/` (semantic, completeness, examples + client)
  - `src/commands/fix.ts`, `src/commands/watch.ts`
  - `src/reporters/sarif.ts`
  - `--deep` and sarif format flags from CLI + Tool API
  - `DriftCategory`: dropped `semantic`, `completeness`, `example`,
    `architecture`, `response-shape` (all AI-only)
  - `AiAnalyzer` type, `getAiAnalyzers()`
  - `config.ai.*` fields + merging
  - Dependencies: `@anthropic-ai/sdk`, `chokidar`, `handlebars`
  - Corresponding tests + snapshots + GitHub Action `deep` input

  The wrapper's `stale_scan` MCP tool no longer advertises `deep` or
  `sarif` format (`@whenlabs/when` patch bump).

  Kept: `scan`, `init`, 10 static analyzers, terminal/json/markdown
  reporters, `--git` flag, the GitHub Action.

  Major version bump for stale.

### Patch Changes

- 4360845: Post-trim cleanup: sync READMEs with the actual command surface, drop a dead `chokidar` dep, and fix stale's summary `passed` count.

  - **READMEs rewritten** for the 5 trimmed tools so they match what the CLI actually ships. Removed references to commands and flags that no longer exist (`vow fix|hook|audit|diff|policy`, `vow --offline|--api-key|ANTHROPIC_API_KEY`; `stale fix|watch`, `stale --deep`, `STALE_AI_KEY`, SARIF format; `aware watch|validate|doctor|add`, `--exit-code`; `envalid onboard|hook|export|watch|fix|migrate`, plugins, secret providers, framework adapters). Documented the flags each command actually accepts today (e.g. `aware diff --check|--json|--target|--quiet`, `vow check --ignore`).
  - **aware**: removed unused `chokidar` dependency (carried over from the dropped `aware watch` command — `grep chokidar src/` had zero hits).
  - **stale**: fixed `summary.passed` going negative on reports with many issues. `buildSummary` was computing `totalChecks - errors - warnings - infos`, where `totalChecks` was per (doc × analyzer) but issues are per finding, so a heavy report trivially overflowed it. `totalChecks` now counts analyzers run, and `passed` counts analyzers whose category produced zero issues. Per-category `passed` is now `1` when that analyzer ran and produced no issues, `0` otherwise. Test fixture + snapshot updated for the post-trim DriftCategory set.
  - **vow**: deleted `docs/workflows/` — the three example workflow YAMLs and their README referenced `vow check --offline`, `vow diff`, `vow policy compile`, `ANTHROPIC_API_KEY`, and the archived `whenlabs-org/vow@v1` composite action, none of which exist anymore.

- dbbb266: Drop stale GitHub Action inputs that no longer do anything.

  `packages/stale/action/action.yml` still advertised `deep` ("Enable AI-powered deep analysis (requires STALE_AI_KEY secret)") and listed `sarif` as a valid `format` value, but both were removed from the tool in the trim — `run.ts` no longer reads `deep` and `parseFormat` silently falls back to `terminal` when passed `sarif`. Removed the dead input and trimmed the `format` description to `terminal, json, markdown` so the Action surface matches reality.

## 0.3.1

### Patch Changes

- aa843ca: Republish via pnpm so `workspace:^` / stale `@whenlabs/core` ranges get rewritten to concrete versions. Previous tarballs for berth/envalid/stale shipped with literal `workspace:^` in `dependencies` (EUNSUPPORTEDPROTOCOL on npm install); aware/vow shipped with `@whenlabs/core@^0.1.0` which doesn't resolve against core@1.0.0.
