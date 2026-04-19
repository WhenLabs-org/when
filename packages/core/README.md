# @whenlabs/core

Shared TypeScript types for the [@whenlabs](https://github.com/WhenLabs-org) developer toolkit. Pure types package — no runtime, no dependencies.

## Purpose

`@whenlabs/core` defines the contract that every WhenLabs child tool (`vow`, `berth`, `stale`, `envalid`, `aware`) implements so the kit (`@whenlabs/when`) can consume them in-process through a single typed surface instead of shelling out and regex-matching stdout.

## Exports

- **`schemaVersion`** — `1 as const`. Every `ScanResult` stamps this so the kit can refuse to consume a future incompatible shape.
- **`Tool`** — the child-tool interface: `{ name, description, scan(opts?), fix?(finding) }`.
- **`ScanResult`** — the return type of `Tool.scan()`: `{ schemaVersion, tool, ok, project, findings[], summary, timing, raw? }`.
- **`Finding`** — a single scan item: `{ tool, ruleId, severity, message, suggestion?, location?, data? }`.
- **`ProjectContext`** — project identity shared across a scan: `{ name, cwd, detectedStack[], configPath? }`.
- **`SuggestionRule`** — the trigger/emit rule shape used by the kit's post-invocation suggestion layer.
- **`translateScanResult(input)`** — forward-compat seam for future `schemaVersion` bumps. No-op in v1.0; returns v1 results as-is and throws on any other `schemaVersion`.

Supporting types also exported: `Severity`, `Location`, `ScanOptions`, `ScanTiming`, `ScanSummary`, `Patch`, `TriggerContext`, `VersionedResult`.

## Stability: v1.0 contract

As of v1.0 the contract is **stable**. The additive-only pre-v1.0 discipline has ended — every exported type, field, and constant is now locked.

- **Any breaking change requires a 2.0 major bump.** Renames, removals, tightenings (widening `string` → `'a' | 'b'`, optional → required) all qualify.
- **Additive changes remain safe in 1.x.** A new optional field, a new exported type, or a new variant on a union typed as `string` can ship in a minor release.
- **`schemaVersion` is the long-lived signal.** It stays at `1` for the entire 1.x line. A 2.0 core bumps it to `2` and ships a translator via `translateScanResult()` so 1.x consumers have a migration path.

Red-flag items previously deferred (closed `detectedStack` enum, `inspect()` method, streaming `scan()`) are now 2.0 candidates — they cannot land in 1.x without breaking the contract.

## Known limitations (v0.1)

1. **Berth's scan returns state, not findings.** `berth.detectAllActive()` returns `{ ports, docker, warnings }` — that's detection, not evaluation. `Tool.scan()` here is modeled on the conflict view. Pure-state output (ports/processes that aren't conflicts) doesn't fit the `Finding[]`-driven contract cleanly. A second method (e.g. `inspect(): Promise<State>`) is a Phase 6 candidate.
2. **`ScanSummary.byLicense`-style Maps don't round-trip.** `vow`'s native summary uses `Map<string, number>`. The escape hatch is `ScanSummary.extra: Record<string, unknown>` — put plain-object rollups there; keep the native `Map` on `ScanResult.raw` if callers need it.
3. **`Tool.fix()` is unvalidated.** The `fix(finding) → Patch | null` shape is sketched but hasn't been exercised against any real fix flow. It's optional on `Tool`, so v0.1 doesn't block on it. Phase 6 pass recommended.
4. **No streaming / progress.** `scan()` returns a single `Promise<ScanResult>`. Slow tools (stale + AI, vow on large monorepos) can't emit progress. If the kit needs progress events, v0.2+ will add an observer arg or async-iterator variant.
5. **`ProjectContext.detectedStack: string[]` is loose.** A closed enum would be safer for tools that want to consume it programmatically, but that's a tightening change. Left loose for v0.1; revisit in Phase 6.

Escape hatches (both intentional):

- `Finding.data?: unknown` — per-item native payload passthrough (`PackageInfo`, `Conflict`, `DriftIssue`, …).
- `ScanResult.raw?: unknown` — full native result for reporters / fixers that need the untransformed shape.

## License

MIT
