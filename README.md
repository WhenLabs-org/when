# @whenlabs/when

**Six tools. One install.**

A single installable toolkit that brings six WhenLabs developer tools into your Claude Code / AI coding agent workflow. Once installed, all tools are available as MCP tools in every session — Claude uses them automatically when relevant.

## Install

```bash
npx @whenlabs/when install
```

This is a one-time setup. After install, all six tools are available in every project you open with Claude Code.

## What it does

Running `npx @whenlabs/when install` will:

1. Register **two MCP servers** in your Claude Code configuration:
   - `velocity-mcp` — task timing and estimation tools
   - `whenlabs` — stale, envalid, berth, aware, and vow tools
2. Inject **CLAUDE.md instructions** so Claude knows when to use each tool automatically

Once connected, Claude can call any tool directly without you asking. For example, after a refactor Claude might run `stale_scan` to check for doc drift, or before a release it might run `vow_check` to validate licenses.

## MCP Tools

These tools are available to Claude in every session after install:

| MCP Tool | What it does |
|---|---|
| `velocity_start_task` | Start timing a coding task |
| `velocity_end_task` | End timing and record results |
| `velocity_estimate` | Estimate time for a planned task |
| `velocity_stats` | Show aggregate performance stats |
| `velocity_history` | Show task history |
| `stale_scan` | Detect documentation drift |
| `envalid_validate` | Validate .env files against schemas |
| `envalid_detect` | Find undocumented env vars in codebase |
| `berth_status` | Show active ports and conflicts |
| `berth_check` | Scan project for port conflicts |
| `aware_init` | Auto-detect stack, generate AI context files |
| `aware_doctor` | Diagnose project health and config issues |
| `vow_scan` | Scan and summarize dependency licenses |
| `vow_check` | Validate licenses against policy |

## CLI Usage

You can also run tools directly from the command line:

```bash
when stale scan
when envalid validate
when berth status
when aware init
when vow scan
when status          # Show installation status
```

## Uninstall

```bash
npx @whenlabs/when uninstall
```

Removes both MCP servers and cleans up CLAUDE.md instructions.

## License

MIT — see [LICENSE](./LICENSE)

---

Built by [Siddharth](https://github.com/Caissaisdead) at [WhenLabs](https://github.com/WhenLabs-org)
