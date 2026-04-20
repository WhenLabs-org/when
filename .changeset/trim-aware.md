---
"@whenlabs/aware": major
---

Trim aware CLI surface to the 3 core commands.

The wrapper's MCP only exposes `aware_sync`; the other commands were
CLI-only conveniences for editing `.aware.json`, toggling fragments,
or diagnosing setup. Per the complexity audit most had no test
coverage and overlapped with the 3 core commands.

Removed commands:
  - `watch` (IDE/editor file watchers already do this)
  - `validate` (overlaps with config load + startup checks)
  - `doctor` (duplicates `diff --check`)
  - `add` / `remove` (users edit .aware.json directly)
  - `fragments list|disable|enable` (fragment registry is internal)
  - `plugin add|remove|list` (plugins[] declared in .aware.json directly)
  - `install-hooks` (3-line bash snippet is simpler)
  - `sync --refresh-conventions` flag (Phase-3 upgrade path, no current callers)

Kept: `init`, `sync`, `diff`. The library API (detector registry,
fragment resolver, generator base classes, monorepo scanner, plugin
loader, conventions extractor) is untouched — those are internal to
sync/diff today and removing them is a larger refactor than this cut
scopes.

Major version bump.
