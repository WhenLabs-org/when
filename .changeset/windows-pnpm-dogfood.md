---
"@whenlabs/when": patch
"@whenlabs/vow": minor
"@whenlabs/envalid": patch
---

- `@whenlabs/when`: resolve sibling CLIs by walking `node_modules` directly so MCP tools work under pnpm, hoisted npm, and Windows. Scan tools now paginate (`limit`/`offset`) and cap output at 100KB. `aware_sync` fires the same auto-trigger as `aware_init` when context files regenerate.
- `@whenlabs/vow`: add `pnpm-lock.yaml` resolver — vow now scans pnpm workspaces against the `.pnpm` store with registry fallback.
- `@whenlabs/envalid`: `envalid detect` no longer hard-errors when `.env.schema` is missing. With no schema it lists env vars found in code and suggests `--generate`.
