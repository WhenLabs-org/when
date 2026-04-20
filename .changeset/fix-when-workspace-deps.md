---
"@whenlabs/when": patch
---

Republish with workspace dependency versions resolved. 0.11.3 shipped with literal `workspace:^` strings in `dependencies`, which caused `npx -p @whenlabs/when when-mcp` to fail with `EUNSUPPORTEDPROTOCOL` and broke MCP installs.
