import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function piniaFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.stateManagement, "pinia")) return null;

  return {
    id: "pinia",
    category: "state-management",
    title: "Pinia",
    priority: 46,
    content: `## Pinia State Management (Vue)

### Store Pattern
- Define stores with \`defineStore\` in dedicated files (\`src/stores/\` by convention)
- Prefer the **setup-syntax** form (\`defineStore('id', () => { ... })\`) over options API — it composes with \`computed\` and \`watch\` naturally
- Return \`{ state, getters, actions }\` from the setup; anything not returned is private
- Use a unique string id per store; it's the key in devtools and for SSR hydration

### Usage
- Import the store factory and call it inside \`setup()\` / \`<script setup>\`: \`const auth = useAuthStore()\`
- Destructure with \`storeToRefs()\` to keep reactivity on state/getters; methods can destructure normally
- Never mutate state outside actions in SSR contexts — request isolation depends on it

### Patterns
- Use multiple small stores instead of one monolithic store; stores can call each other
- Derive computed state via \`computed()\` inside the setup store (equivalent to getters)
- Subscribe to changes with \`store.$subscribe((mutation, state) => ...)\` for analytics / persistence
- Plugins: install via \`pinia.use(plugin)\` for cross-store concerns (persistence, logging)`,
  };
}
