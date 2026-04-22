---
"@whenlabs/aware": patch
"@whenlabs/berth": patch
"@whenlabs/stale": patch
---

Windows CI fixes re-landed on the post-trim monorepo:

- `@whenlabs/berth`: `config/loader.ts` realpaths the file before `pathToFileURL`, and `config/plugins.ts` does the same. On Windows GHA runners, tmp dirs come through as 8.3 short paths like `C:\Users\RUNNER~1\...`; `pathToFileURL` percent-encodes the `~` to `%7E` and the ESM loader then can't find the module. `tests/tool.test.ts` uses `path.resolve('/tmp')` for comparisons so it doesn't fail against `D:\tmp` on Windows.
- `@whenlabs/aware`: `plugins/loader.ts` applies the same realpath-before-pathToFileURL fix.
- `@whenlabs/stale`: `parsers/markdown.ts` splits on `/\r?\n/` instead of `\n`, so regex anchors match on CRLF-terminated files. Previously the integration scan silently missed command issues on Windows because `.` in the manager/args regex doesn't match `\r` and `$` in non-multiline mode doesn't match before `\r`.
