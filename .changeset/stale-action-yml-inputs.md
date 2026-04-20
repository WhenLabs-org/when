---
"@whenlabs/stale": patch
---

Drop stale GitHub Action inputs that no longer do anything.

`packages/stale/action/action.yml` still advertised `deep` ("Enable AI-powered deep analysis (requires STALE_AI_KEY secret)") and listed `sarif` as a valid `format` value, but both were removed from the tool in the trim — `run.ts` no longer reads `deep` and `parseFormat` silently falls back to `terminal` when passed `sarif`. Removed the dead input and trimmed the `format` description to `terminal, json, markdown` so the Action surface matches reality.
