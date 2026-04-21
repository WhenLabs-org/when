# @whenlabs/when

## 0.12.1

### Patch Changes

- a98efcd: Fix `when install` registering a broken MCP server command.

  `when install` wrote `npx @whenlabs/when when-mcp` to the Claude Code MCP config, which fails at startup with `error: unknown command 'when-mcp'` — `npx <pkg> <bin>` runs the package's default bin (`when`) and passes the rest as args. The correct form for the non-default bin is `npx -y -p @whenlabs/when@latest when-mcp`. Users on `@whenlabs/when@0.12.0` who ran `npx @whenlabs/when install` were left with an MCP server that Claude Code couldn't connect to; existing users should re-run the installer after upgrading.

  Also updated the manual-config snippet in the README so copy-pasters don't hit the same wall.

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

- Updated dependencies [4360845]
- Updated dependencies [dbbb266]
- Updated dependencies [e9efbd7]
- Updated dependencies [2bb57e4]
- Updated dependencies [f1b3685]
- Updated dependencies [8019f9f]
- Updated dependencies [da2bccd]
  - @whenlabs/aware@1.0.0
  - @whenlabs/berth@1.0.0
  - @whenlabs/envalid@1.0.0
  - @whenlabs/stale@1.0.0
  - @whenlabs/vow@1.0.0

## 0.12.0

### Minor Changes

- 290c3d8: Trim the MCP surface and wrapper CLI back to what the tagline promised.

  - **MCP tools: 48 → 7.** One endpoint per tool plus velocity's timing pair: `aware_sync`, `berth_check`, `envalid_validate`, `stale_scan`, `vow_scan`, `velocity_start_task`, `velocity_end_task`. Agents drive scanning; fix/init/auxiliary operations move to each tool's CLI (`npx @whenlabs/<tool> --help`).
  - **`when` CLI: 13 → 4.** Kept: `init`, `doctor`, `install`, `uninstall`. Removed: `status`, `ci`, `watch`, `config`, `upgrade`, `eject`, `diff`, `dashboard`, `mcp`, plus the `delegate` shims and the `.whenlabs.yml` unified-config plumbing. Each tool reads its own config again.
  - **Install targets: Claude Code only.** Removed `--cursor`/`--vscode`/`--windsurf`/`--all` flags and the status-line Python script — `install` now writes exactly two files (`~/.claude.json` and `~/.claude/CLAUDE.md`).
  - **Cross-tool SUGGESTION_RULES removed.** Agents decide when to chain tools.
  - **GitHub Action (`packages/when/action.yml`) removed** — the Action depended on `when ci`. CI users can invoke each tool's CLI directly in their workflows.

  Nothing on npm has shipped yet, so there is no consumer breakage. The underlying per-tool packages are unchanged; only the `@whenlabs/when` umbrella surface is reduced.

## 0.11.4

### Patch Changes

- a8f428e: Republish with workspace dependency versions resolved. 0.11.3 shipped with literal `workspace:^` strings in `dependencies`, which caused `npx -p @whenlabs/when when-mcp` to fail with `EUNSUPPORTEDPROTOCOL` and broke MCP installs.
- Updated dependencies [e44da02]
  - @whenlabs/velocity-mcp@0.1.4

## 0.11.3

### Patch Changes

- a5dff54: Add `when mcp` subcommand so `npx @whenlabs/when mcp` boots the MCP server without the `-p` flag workaround. The standalone `when-mcp` bin still works for users who prefer it.
