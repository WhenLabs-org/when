# @whenlabs/envalid

## 1.0.0

### Major Changes

- f1b3685: Trim surface to a focused .env schema validator.

  Removed: framework adapters (express/fastify/nextjs/nestjs/vite), secret providers (Vault/AWS SM/Doppler/1Password), the plugin loader, and the `watch`, `onboard`, `hook`, `migrate`, `export`, `fix` subcommands. Also removed `validateAsync` and the `--check-live` / `--resolve-secrets` / `--concurrency` flags on `validate`.

  Kept: `validate`, `init`, `diff`, `generate-example`, `sync`, `detect`, `secrets`, `codegen`. The validator registry remains for the 11 built-in types but no longer supports runtime-loaded plugins or secret providers.

### Patch Changes

- 4360845: Post-trim cleanup: sync READMEs with the actual command surface, drop a dead `chokidar` dep, and fix stale's summary `passed` count.

  - **READMEs rewritten** for the 5 trimmed tools so they match what the CLI actually ships. Removed references to commands and flags that no longer exist (`vow fix|hook|audit|diff|policy`, `vow --offline|--api-key|ANTHROPIC_API_KEY`; `stale fix|watch`, `stale --deep`, `STALE_AI_KEY`, SARIF format; `aware watch|validate|doctor|add`, `--exit-code`; `envalid onboard|hook|export|watch|fix|migrate`, plugins, secret providers, framework adapters). Documented the flags each command actually accepts today (e.g. `aware diff --check|--json|--target|--quiet`, `vow check --ignore`).
  - **aware**: removed unused `chokidar` dependency (carried over from the dropped `aware watch` command — `grep chokidar src/` had zero hits).
  - **stale**: fixed `summary.passed` going negative on reports with many issues. `buildSummary` was computing `totalChecks - errors - warnings - infos`, where `totalChecks` was per (doc × analyzer) but issues are per finding, so a heavy report trivially overflowed it. `totalChecks` now counts analyzers run, and `passed` counts analyzers whose category produced zero issues. Per-category `passed` is now `1` when that analyzer ran and produced no issues, `0` otherwise. Test fixture + snapshot updated for the post-trim DriftCategory set.
  - **vow**: deleted `docs/workflows/` — the three example workflow YAMLs and their README referenced `vow check --offline`, `vow diff`, `vow policy compile`, `ANTHROPIC_API_KEY`, and the archived `whenlabs-org/vow@v1` composite action, none of which exist anymore.

## 0.3.1

### Patch Changes

- aa843ca: Republish via pnpm so `workspace:^` / stale `@whenlabs/core` ranges get rewritten to concrete versions. Previous tarballs for berth/envalid/stale shipped with literal `workspace:^` in `dependencies` (EUNSUPPORTEDPROTOCOL on npm install); aware/vow shipped with `@whenlabs/core@^0.1.0` which doesn't resolve against core@1.0.0.
