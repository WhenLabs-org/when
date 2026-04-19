import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function zustandFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.stateManagement, "zustand")) return null;

  return {
    id: "zustand",
    category: "state-management",
    title: "Zustand",
    priority: 45,
    content: `## Zustand State Management

### Store Pattern
- Define stores in dedicated files (e.g., \`src/store/\` or \`src/stores/\`)
- Use the \`create\` function to define stores with typed state and actions
- Keep stores focused — one store per domain concern, not one global store
- Co-locate selectors with the store definition

### Usage
- Use selectors to subscribe to specific slices of state: \`useStore((s) => s.count)\`
- Never subscribe to the entire store — always select the minimal state needed
- Use \`useShallow\` for selecting multiple values to avoid unnecessary re-renders
- Access state outside React with \`useStore.getState()\` and \`useStore.setState()\`

### Patterns
- Use the slice pattern for large stores: split into separate slices combined with \`...a, ...b\`
- Use \`immer\` middleware for complex nested state updates
- Use \`persist\` middleware for localStorage/sessionStorage persistence
- Use \`devtools\` middleware in development for Redux DevTools integration
- Avoid putting derived/computed values in the store — compute them in selectors or components`,
  };
}
