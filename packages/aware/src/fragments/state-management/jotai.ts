import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function jotaiFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.stateManagement, "jotai")) return null;

  return {
    id: "jotai",
    category: "state-management",
    title: "Jotai",
    priority: 45,
    content: `## Jotai State Management

### Atoms
- Define atoms in dedicated files (e.g., \`src/atoms/\` or co-located with features)
- Use \`atom()\` for primitive atoms — these are the single source of truth
- Use derived atoms (\`atom((get) => ...)\`) for computed values instead of storing derived state
- Use \`atomWithStorage\` for persisted state (localStorage/sessionStorage)

### Usage
- Use \`useAtom\` for read-write access, \`useAtomValue\` for read-only, \`useSetAtom\` for write-only
- Prefer \`useAtomValue\`/\`useSetAtom\` over \`useAtom\` to minimize re-renders
- Atoms are globally accessible — no need for providers (unless scoping with \`Provider\`)

### Async & Integration
- Use \`atomWithQuery\` (jotai-tanstack-query) for server state
- Use \`loadable\` utility to handle async atom loading states without Suspense
- Use \`atomFamily\` for parameterized atoms (e.g., per-item state)
- Use \`selectAtom\` to subscribe to a slice of an atom and prevent unnecessary re-renders`,
  };
}
