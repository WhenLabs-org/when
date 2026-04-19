import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function valtioFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.stateManagement, "valtio")) return null;

  return {
    id: "valtio",
    category: "state-management",
    title: "Valtio",
    priority: 46,
    content: `## Valtio State Management

### Proxy Model
- Create stores with \`proxy({ ... })\`; mutations look like normal JS (\`state.count++\`) and auto-notify subscribers
- \`useSnapshot(state)\` in components returns an immutable snapshot — use that in JSX, not the proxy directly, or React won't re-render correctly
- Snapshots are frozen; attempting to mutate them throws a helpful error

### Patterns
- Keep proxies plain objects and arrays; nested objects become proxies automatically
- Derived values: use \`derive({ total: (get) => get(state).items.reduce(...) })\` rather than ad-hoc getters so updates invalidate correctly
- Subscribe imperatively outside React with \`subscribe(state, () => ...)\` for logging / persistence
- \`subscribeKey(state, 'count', ...)\` for fine-grained change tracking

### Anti-patterns
- Don't mix Valtio with \`useState\`/\`useReducer\` for the same domain — pick one per concern
- Don't store non-serializable values (class instances, DOM nodes) in a proxy if you plan to persist it
- Don't destructure from the proxy; destructure from the snapshot returned by \`useSnapshot\``,
  };
}
