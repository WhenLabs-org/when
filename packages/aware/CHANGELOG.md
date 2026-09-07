# @whenlabs/aware

## 1.0.1

### Patch Changes

- a2d7aae: Drop `###` subsection headings from the Copilot output when their bullet body is fully trimmed away. Previously, the bullet cap in `trimFragment` would leave naked headings (e.g. `### React Component Testing`, `### Layer Caching`, `### Performance`) with empty bodies in `.github/copilot-instructions.md`. The heading is now omitted whenever no bullet survives before the next heading or end-of-fragment.
- 0ba362c: Skip the internal `conventions.extracted` block (and any underscore-prefixed top-level convention key) when rendering the Conventions section. These entries hold sampled extractor state, not user-facing conventions, and previously emitted nested objects as `[object Object]` in the generated CLAUDE.md / AGENTS.md / copilot files.
- 562d11a: Windows CI fixes re-landed on the post-trim monorepo:

  - `@whenlabs/berth`: `config/loader.ts` realpaths the file before `pathToFileURL`, and `config/plugins.ts` does the same. On Windows GHA runners, tmp dirs come through as 8.3 short paths like `C:\Users\RUNNER~1\...`; `pathToFileURL` percent-encodes the `~` to `%7E` and the ESM loader then can't find the module. `tests/tool.test.ts` uses `path.resolve('/tmp')` for comparisons so it doesn't fail against `D:\tmp` on Windows.
  - `@whenlabs/aware`: `plugins/loader.ts` applies the same realpath-before-pathToFileURL fix.
  - `@whenlabs/stale`: `parsers/markdown.ts` splits on `/\r?\n/` instead of `\n`, so regex anchors match on CRLF-terminated files. Previously the integration scan silently missed command issues on Windows because `.` in the manager/args regex doesn't match `\r` and `$` in non-multiline mode doesn't match before `\r`.

## 1.0.0

### Major Changes

- e9efbd7: Trim aware CLI surface to the 3 core commands.

  The wrapper's MCP only exposes `aware_sync`; the other commands were
  CLI-only conveniences for editing `.aware.json`, toggling fragments,
  or diagnosing setup. Per the complexity audit most had no test
  coverage and overlapped with the 3 core commands.

  Removed commands:

  - `watch` (IDE/editor file watchers already do this)
  - `validate` (overlaps with config load + startup checks)
  - `doctor` (duplicates `diff --check`)
  - `add` / `remove` (users edit .aware.json directly)
  - `fragments list|disable|enable` (fragment registry is internal)
  - `plugin add|remove|list` (plugins[] declared in .aware.json directly)
  - `install-hooks` (3-line bash snippet is simpler)
  - `sync --refresh-conventions` flag (Phase-3 upgrade path, no current callers)

  Kept: `init`, `sync`, `diff`. The library API (detector registry,
  fragment resolver, generator base classes, monorepo scanner, plugin
  loader, conventions extractor) is untouched — those are internal to
  sync/diff today and removing them is a larger refactor than this cut
  scopes.

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
