# @whenlabs/when

## 0.11.4

### Patch Changes

- a8f428e: Republish with workspace dependency versions resolved. 0.11.3 shipped with literal `workspace:^` strings in `dependencies`, which caused `npx -p @whenlabs/when when-mcp` to fail with `EUNSUPPORTEDPROTOCOL` and broke MCP installs.
- Updated dependencies [e44da02]
  - @whenlabs/velocity-mcp@0.1.4

## 0.11.3

### Patch Changes

- a5dff54: Add `when mcp` subcommand so `npx @whenlabs/when mcp` boots the MCP server without the `-p` flag workaround. The standalone `when-mcp` bin still works for users who prefer it.
