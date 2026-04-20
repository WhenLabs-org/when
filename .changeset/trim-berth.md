---
"@whenlabs/berth": major
---

Trim berth to a focused port-conflict detective.

Dropped 14 CLI subcommands and their supporting subsystems. Berth is now `status`, `check`, `kill`, `resolve`, `reassign`, and `init` — the detective job.

Removed:
  - commands: `free`, `list`, `register`, `start`, `predict`, `watch`, `reserve`, `unreserve`, `reservations`, `team`, `doctor`, `install-shell-hook`, `remote`, `history`
  - subsystems: `src/registry/` (project + reservation registry), `src/history/` (event recorder), `src/config/team.ts` (team config), `src/mcp/` (the wrapper handles MCP; standalone `berth-mcp` bin is gone)
  - conflict engine: stripped reservation, team, and range-violation handling
  - reporters: `renderList` (registry-only)
  - package.json: dropped `berth-mcp` bin, `@modelcontextprotocol/sdk` and `node-notifier` deps

Kept: all detectors (lsof/netstat/docker/package-json/docker-compose/dotenv/procfile/makefile/devcontainer/framework/berthrc), the core resolver, the `--quick` cache, the `createTool()` library entry.

Major version bump.
