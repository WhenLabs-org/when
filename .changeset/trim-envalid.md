---
"@whenlabs/envalid": major
---

Trim surface to a focused .env schema validator.

Removed: framework adapters (express/fastify/nextjs/nestjs/vite), secret providers (Vault/AWS SM/Doppler/1Password), the plugin loader, and the `watch`, `onboard`, `hook`, `migrate`, `export`, `fix` subcommands. Also removed `validateAsync` and the `--check-live` / `--resolve-secrets` / `--concurrency` flags on `validate`.

Kept: `validate`, `init`, `diff`, `generate-example`, `sync`, `detect`, `secrets`, `codegen`. The validator registry remains for the 11 built-in types but no longer supports runtime-loaded plugins or secret providers.
