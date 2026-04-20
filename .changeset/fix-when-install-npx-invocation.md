---
"@whenlabs/when": patch
---

Fix `when install` registering a broken MCP server command.

`when install` wrote `npx @whenlabs/when when-mcp` to the Claude Code MCP config, which fails at startup with `error: unknown command 'when-mcp'` — `npx <pkg> <bin>` runs the package's default bin (`when`) and passes the rest as args. The correct form for the non-default bin is `npx -y -p @whenlabs/when@latest when-mcp`. Users on `@whenlabs/when@0.12.0` who ran `npx @whenlabs/when install` were left with an MCP server that Claude Code couldn't connect to; existing users should re-run the installer after upgrading.

Also updated the manual-config snippet in the README so copy-pasters don't hit the same wall.
