---
"@whenlabs/when": patch
"@whenlabs/vow": minor
"@whenlabs/envalid": patch
"@whenlabs/berth": patch
"@whenlabs/stale": patch
---

- `@whenlabs/when`: resolve sibling CLIs by walking `node_modules` directly so MCP tools work under pnpm, hoisted npm, and Windows. Scan tools now paginate (`limit`/`offset`) and cap output at 100KB. `aware_sync` fires the same auto-trigger as `aware_init` when context files regenerate.
- `@whenlabs/vow`: add `pnpm-lock.yaml` resolver — vow now scans pnpm workspaces against the `.pnpm` store with registry fallback.
- `@whenlabs/envalid`: `envalid detect` no longer hard-errors when `.env.schema` is missing. With no schema it lists env vars found in code and suggests `--generate`. Fix `runWatch` never firing on Windows because the target-basename index was splitting on `/` only.
- `@whenlabs/berth`: resolve the real path before building the `file://` URL for `.mjs`/`.js` config files — fixes dynamic import under Windows temp dirs where `os.tmpdir()` returns an 8.3 short path like `C:\Users\RUNNER~1\...`.
- `@whenlabs/stale`: fix command detection in markdown code blocks with CRLF line endings (`.` in the manager regex doesn't match `\r`, so the whole line silently missed).
