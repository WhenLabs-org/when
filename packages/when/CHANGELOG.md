# @whenlabs/when

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
