# @whenlabs/when

**Six tools. One install.**

A single installable toolkit that brings six WhenLabs developer tools into your Claude Code / AI coding agent workflow.

## Install

```bash
npx @whenlabs/when install
```

## Tools

| Command | Description |
|---|---|
| `when velocity` | Task timing & estimation MCP server |
| `when stale` | Detect documentation drift |
| `when envalid` | Validate .env files against schemas |
| `when berth` | Detect and resolve port conflicts |
| `when aware` | Auto-detect stack, generate AI context files |
| `when vow` | Scan dependency licenses |

## What `install` does

Running `npx @whenlabs/when install` will:

1. Register `velocity-mcp` as a user-scope MCP server in your Claude Code configuration
2. Inject CLAUDE.md instructions so Claude Code knows how to use each tool automatically

This is a one-time setup. After install, all six tools are available in every project you open with Claude Code.

## Usage

```bash
# Check for stale documentation
when stale

# Validate your .env file
when envalid

# Find and resolve port conflicts
when berth

# Detect your stack and generate AI context
when aware

# Scan licenses for all dependencies
when vow

# Show task timing stats
when velocity stats
```

## Uninstall

```bash
npx @whenlabs/when uninstall
```

This removes the MCP server registration and cleans up any injected CLAUDE.md instructions.

## License

MIT — see [LICENSE](./LICENSE)

---

Built by [WhenLabs](https://github.com/WhenLabs-org)
