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

Supporting types also exported: `Severity`, `Location`, `ScanOptions`, `ScanTiming`, `ScanSummary`, `Patch`, `TriggerContext`.

## Discipline: additive-only until v1.0

The whole point of pinning this to `0.1.x` is stability. Until v1.0:

- **Never rename** an exported type, field, or constant.
- **Never remove** an exported type, field, or constant.
- **Never tighten** a type (e.g. widening `string` → `'a' | 'b'`, making optional → required).
- **Adding** a new optional field, a new exported type, or a new enum variant on a union typed as `string` is allowed.

Breaking changes wait for v1.0. Red-flag items from Phase 2 (closed `detectedStack` enum, `inspect()` method, streaming) are deliberately deferred.

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
