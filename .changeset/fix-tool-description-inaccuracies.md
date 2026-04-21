---
"@whenlabs/when": patch
---

Fix factual inaccuracies in vow_scan and berth_check tool descriptions. vow previously claimed to read pnpm-lock.yaml, yarn.lock, and go.sum — it does not. berth previously singled out vite.config.* — it detects frameworks generically and does not parse vite configs specifically. Descriptions now match actual runtime behavior.
