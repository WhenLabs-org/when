---
"@whenlabs/aware": patch
---

Skip the internal `conventions.extracted` block (and any underscore-prefixed top-level convention key) when rendering the Conventions section. These entries hold sampled extractor state, not user-facing conventions, and previously emitted nested objects as `[object Object]` in the generated CLAUDE.md / AGENTS.md / copilot files.
