---
"@whenlabs/aware": patch
---

Drop `###` subsection headings from the Copilot output when their bullet body is fully trimmed away. Previously, the bullet cap in `trimFragment` would leave naked headings (e.g. `### React Component Testing`, `### Layer Caching`, `### Performance`) with empty bodies in `.github/copilot-instructions.md`. The heading is now omitted whenever no bullet survives before the next heading or end-of-fragment.
