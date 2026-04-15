import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function xstateFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.stateManagement, "xstate")) return null;

  return {
    id: "xstate",
    category: "state-management",
    title: "XState",
    priority: 45,
    content: `## XState State Management

### Machines
- Define state machines with \`createMachine\` — model states, events, and transitions explicitly
- Keep machines in dedicated files (e.g., \`src/machines/\` or co-located with features)
- Use the \`setup()\` API (v5) to define types, actions, guards, and actors before creating the machine
- Model all possible states — XState prevents impossible states by design

### Usage in React
- Use \`useMachine\` or \`useActor\` hooks to consume machines in components
- Send events with \`send({ type: "EVENT_NAME" })\` — never set state directly
- Use \`useSelector\` to subscribe to specific machine state for performance

### Patterns
- Use \`invoke\` for async operations (promises, callbacks, other machines)
- Use guards (\`cond\`) for conditional transitions
- Use context for extended state (data that isn't finite states)
- Use \`assign\` to update context — keep it pure
- Use the XState visualizer (stately.ai/viz) to design and debug machines`,
  };
}
