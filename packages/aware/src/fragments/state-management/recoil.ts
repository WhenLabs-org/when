import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function recoilFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.stateManagement, "recoil")) return null;

  return {
    id: "recoil",
    category: "state-management",
    title: "Recoil",
    priority: 46,
    content: `## Recoil State Management

### Atoms & Selectors
- Define atoms with unique \`key\` strings and a \`default\` value — keys must be globally unique across the app
- Derive computed state with \`selector({ key, get })\`; selectors memoize per-dependency-set
- For async data: \`selector({ get: async ({ get }) => ... })\` integrates with Suspense — wrap consumers in \`<React.Suspense>\`

### Usage
- \`useRecoilValue(atom)\` — read only; component re-renders on change
- \`useRecoilState(atom)\` — read + write, like \`useState\`
- \`useSetRecoilState(atom)\` — writer only; avoids re-rendering the component on atom changes
- \`useResetRecoilState(atom)\` — restore the default

### Patterns
- Wrap the app tree in \`<RecoilRoot>\` at the top level; nest \`<RecoilRoot override>\` for isolated state sandboxes
- Prefer atomFamily / selectorFamily for parameterized state (e.g., \`todoAtomFamily(id)\`)
- Keep atom keys namespaced by feature to prevent collisions as the app grows

### Heads-up
- Recoil development has slowed since 2023; for new projects consider Zustand, Jotai, or Redux Toolkit. Kept here for existing Recoil codebases.`,
  };
}
