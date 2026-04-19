import type {
  AwareConfig,
  DetectedStack,
  Fragment,
  FragmentCategory,
  FragmentFunction,
  FragmentModule,
  StackItem,
} from "../types.js";
import { majorVersion, versionMatches } from "./common.js";

/**
 * Which DetectedStack field(s) each FragmentCategory maps to. Used by
 * `findStackItem` so an `appliesTo: { stack: "next" }` on a framework
 * fragment only searches stack.framework — not every category. Without
 * this, a plugin that adds a stack item named "next" to an unrelated
 * category could accidentally match.
 *
 * Keep in sync with FragmentCategory in types.ts.
 */
const CATEGORY_TO_FIELDS: Record<FragmentCategory, Array<keyof DetectedStack>> = {
  framework: ["framework"],
  language: ["language"],
  styling: ["styling"],
  orm: ["orm"],
  database: ["database"],
  testing: ["testing"],
  linting: ["linting"],
  deployment: ["deployment"],
  auth: ["auth"],
  api: ["apiStyle"],
  "state-management": ["stateManagement"],
  cicd: ["cicd"],
};

/**
 * Registry of fragment modules. Core fragments self-register at import
 * time via `registerFragmentModule`; plugins (Phase 5) will register
 * through the same API.
 *
 * Phase 0 supports two registration modes:
 *   - Full manifest (`FragmentModule`) — the forward-compatible shape.
 *   - Legacy `FragmentFunction` via `registerLegacy` — each existing
 *     core fragment wraps its bare function so nothing has to change at
 *     once. Duplicate-id protection still applies, but deferred to resolve
 *     time (the id only becomes known when the function runs).
 *
 * Resolution rules:
 *   - All registered modules run in insertion order.
 *   - Results sorted by Fragment.priority (ascending).
 *   - A module with `replaces: [...]` suppresses any result whose id is in
 *     the replaces list. This is the plugin override hook.
 *   - Two fragments that produce the same id without either declaring
 *     `replaces` is a resolve-time error — both in manifest form and
 *     across the legacy bridge.
 *   - `module.version` is threaded onto the returned `Fragment.version`
 *     unless the build function already set one.
 */
export class FragmentRegistry {
  private modules: FragmentModule[] = [];
  private knownManifestIds = new Set<string>();

  register(module: FragmentModule): void {
    const replacesSet = new Set(module.replaces ?? []);
    // Registering a new id is always fine. Registering a colliding id is
    // fine *only* when the new module explicitly declares it's replacing
    // the existing one via `replaces: [conflictingId]`.
    if (this.knownManifestIds.has(module.id) && !replacesSet.has(module.id)) {
      throw new Error(
        `Fragment id collision: "${module.id}" is already registered. ` +
          `Declare \`replaces: ["${module.id}"]\` on the new module to override.`,
      );
    }
    this.knownManifestIds.add(module.id);
    this.modules.push(module);
  }

  registerLegacy(fn: FragmentFunction): void {
    // Legacy fragments carry their id/category/priority inside the
    // returned Fragment object; we can't know them until resolve-time.
    // The synthetic id exists only for internal bookkeeping — callers
    // can't meaningfully target it via `replaces`.
    const synthetic: FragmentModule = {
      id: `__legacy__${this.modules.length}`,
      category: "framework",
      priority: 50,
      build: fn,
    };
    this.modules.push(synthetic);
  }

  resolve(stack: DetectedStack, config: AwareConfig): Fragment[] {
    // Contract: FragmentModule.build functions MUST treat `stack` and
    // `config` as read-only. Plugins are arbitrary code — a buggy
    // `build` that mutates these would poison every subsequent
    // fragment's view. We don't `Object.freeze` because callers
    // downstream of resolve expect to mutate the config further; the
    // contract lives in the type-level doc instead. If a plugin's
    // `build` misbehaves, the resulting drift / test failures will
    // point at it.

    // Map each replaced id to the winning module. A module declaring
    // `replaces: ["X"]` becomes the sole authority for fragments with
    // id X — its own build function's output is kept; any other module
    // producing the same id is suppressed.
    const replacerFor = new Map<string, FragmentModule>();
    for (const mod of this.modules) {
      for (const id of mod.replaces ?? []) {
        replacerFor.set(id, mod);
      }
    }

    // Phase 6: user-level disables. A fragment id in
    // `config.fragments.disabled` is suppressed regardless of whether
    // it's a core or plugin contribution. This is the user's escape
    // hatch for "I just don't want this guidance."
    const disabledIds = new Set(config.fragments?.disabled ?? []);

    const results: Fragment[] = [];
    const seenIds = new Map<string, FragmentModule>();

    for (const mod of this.modules) {
      // Phase 2: declarative `appliesTo` gate. Fragments that declare
      // `appliesTo.stack` / `appliesTo.versionRange` run only when the
      // detected stack matches. This is what makes
      // nextjs-14 and nextjs-15 coexist in the registry without their
      // ids colliding at resolve time — only one matches per project.
      if (!appliesToMatches(mod, stack)) continue;

      const fragment = mod.build(stack, config);
      if (fragment === null) continue;

      // User-level disable: suppress by Fragment.id (the output id
      // rendered into the context files). Applied after `build` so
      // plugins still get a chance to run — disabling a fragment is
      // purely an output filter, not an eligibility gate.
      if (disabledIds.has(fragment.id)) continue;

      const replacer = replacerFor.get(fragment.id);
      if (replacer && replacer !== mod) continue;

      if (seenIds.has(fragment.id)) {
        const existing = seenIds.get(fragment.id)!;
        // Two likely causes for a resolve-time collision:
        //  1. Overlapping `appliesTo` ranges (both matched for the same
        //     project and produce the same id).
        //  2. Two unrelated fragments coincidentally picked the same id.
        // Tailor the hint so authors don't spend time looking in the
        // wrong direction.
        const overlapHint =
          existing.appliesTo?.versionRange && mod.appliesTo?.versionRange
            ? ` Both modules declare \`appliesTo.versionRange\` (` +
              `"${existing.appliesTo.versionRange}" and "${mod.appliesTo.versionRange}")` +
              ` — check for range overlap so only one can match per project.`
            : "";
        throw new Error(
          `Fragment id collision at resolve time: "${fragment.id}" was ` +
            `produced by two fragments (${describeModule(existing)} and ` +
            `${describeModule(mod)}) and neither declares \`replaces\`.${overlapHint} ` +
            `Add \`replaces: ["${fragment.id}"]\` to the overriding module if one is meant to win.`,
        );
      }
      seenIds.set(fragment.id, mod);

      // Thread module.version onto the Fragment unless the build function
      // already set one explicitly. Phase 1 drift detection needs this.
      const withVersion: Fragment =
        fragment.version === undefined && mod.version !== undefined
          ? { ...fragment, version: mod.version }
          : fragment;

      results.push(withVersion);
    }
    results.sort((a, b) => a.priority - b.priority);
    return results;
  }

  /** For tests / debugging. */
  clear(): void {
    this.modules = [];
    this.knownManifestIds.clear();
  }

  size(): number {
    return this.modules.length;
  }
}

function describeModule(mod: FragmentModule): string {
  if (mod.id.startsWith("__legacy__")) return "a legacy fragment";
  return `module "${mod.id}"`;
}

/**
 * Evaluate a module's `appliesTo` gate against the detected stack.
 * A module without `appliesTo` is always eligible (legacy fragments, or
 * fragments that do their own matching inside `build`).
 *
 * When `appliesTo.stack` is set we look for a stack item with a matching
 * name, restricted to the DetectedStack field(s) that correspond to
 * `mod.category`. If `appliesTo.versionRange` is also set, that item's
 * version must satisfy the range. If `appliesTo.variant` is set, the
 * item's variant must match. This lets three `nextjs` fragments with
 * ranges `"<14"`, `"14"`, and `">=15"` coexist — only one matches per
 * project.
 *
 * Null stack-item versions: by default a concrete range like `">=15"`
 * rejects null (we can't prove a match). Modules that want to be the
 * "default when version is unknown" set `matchUnknown: true`.
 */
function appliesToMatches(mod: FragmentModule, stack: DetectedStack): boolean {
  const applies = mod.appliesTo;
  if (!applies) return true;

  const names = applies.stack === undefined
    ? null
    : Array.isArray(applies.stack)
      ? applies.stack
      : [applies.stack];

  if (names !== null) {
    const item = findStackItem(stack, names, mod.category);
    if (!item) return false;
    if (applies.variant !== undefined) {
      const variants = Array.isArray(applies.variant)
        ? applies.variant
        : [applies.variant];
      if (!variants.includes(item.variant ?? "")) return false;
    }
    if (applies.versionRange) {
      const satisfied = versionMatches(item, applies.versionRange);
      if (!satisfied) {
        // Fall-through path: either the version is known and doesn't
        // satisfy the range (hard reject), or the version is unknown —
        // null, or a non-numeric string like `"latest"` that can't be
        // coerced to a major. For the unknown case, `matchUnknown: true`
        // opts the module in as the "default when we can't tell" fallback.
        const versionUnknown = majorVersion(item) === null;
        if (versionUnknown && applies.matchUnknown) {
          // Accept as the unknown-version fallback.
        } else {
          return false;
        }
      }
    }
    return true;
  }

  // `versionRange` alone without `stack` doesn't really make sense —
  // we have no item to compare against. Treat as opt-out (false) so the
  // author notices and sets `stack` too.
  if (applies.versionRange) return false;

  return true;
}

/**
 * Find a stack item with one of the given names, scoped to the
 * DetectedStack field(s) that correspond to `category`. A fragment's
 * category determines where to look — a framework fragment searches
 * `stack.framework`, an orm fragment searches `stack.orm`, etc.
 *
 * If `category` isn't in the map we fall back to searching every
 * category (shouldn't happen for core fragments; defensive for plugins
 * that add categories outside the enum).
 */
function findStackItem(
  stack: DetectedStack,
  names: readonly string[],
  category: FragmentCategory,
): StackItem | null {
  const lowered = names.map((n) => n.toLowerCase());
  const fields = CATEGORY_TO_FIELDS[category];

  if (fields) {
    for (const field of fields) {
      const value = stack[field];
      const match = searchValue(value, lowered);
      if (match) return match;
    }
    return null;
  }

  // Fallback: search everything. Only reached for unknown categories.
  const everything: Array<StackItem | StackItem[] | null | undefined> = [
    stack.framework,
    stack.language,
    stack.styling,
    stack.orm,
    stack.database,
    stack.packageManager,
    stack.monorepo,
    stack.deployment,
    stack.auth,
    stack.apiStyle,
    stack.stateManagement,
    stack.cicd,
    stack.bundler,
    ...(stack.testing ?? []),
    ...(stack.linting ?? []),
  ];
  for (const c of everything) {
    const match = searchValue(c, lowered);
    if (match) return match;
  }
  return null;
}

function searchValue(
  value: StackItem | StackItem[] | null | undefined,
  loweredNames: readonly string[],
): StackItem | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (loweredNames.includes(item.name.toLowerCase())) return item;
    }
    return null;
  }
  return loweredNames.includes(value.name.toLowerCase()) ? value : null;
}

/** Shared default registry. Core fragments populate it; resolvers read from it. */
export const defaultRegistry = new FragmentRegistry();
