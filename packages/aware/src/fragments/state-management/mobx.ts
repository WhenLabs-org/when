import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function mobxFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.stateManagement, "mobx")) return null;

  return {
    id: "mobx",
    category: "state-management",
    title: "MobX",
    priority: 46,
    content: `## MobX State Management

### Store Pattern
- Use \`makeAutoObservable(this)\` in class constructors to mark fields observable and methods actions — far less boilerplate than legacy decorator syntax
- Organize stores by domain (\`UserStore\`, \`CartStore\`), not one root store; compose via a \`RootStore\` only if stores need to reference each other
- Keep store classes small; prefer multiple focused stores over one god object

### Reactivity Rules
- Any mutation must happen inside an action (\`@action\` or auto-inferred via \`makeAutoObservable\`). Async mutations: wrap the post-await state update in \`runInAction\` or an action method
- Computed values (\`@computed\` or getters on observable classes) memoize — use them freely
- Never read observable state from non-reactive code (e.g., plain \`setTimeout\` callbacks) without wrapping in \`autorun\` / \`reaction\`

### React Integration
- Use \`mobx-react-lite\`'s \`observer(Component)\` HOC for every component that reads observable state — missing it means stale renders
- Pass stores via a React Context provider rather than importing singletons directly — easier testing, SSR-safe
- Avoid destructuring observables at the top of a component; read inside JSX so MobX tracks the actual dependency`,
  };
}
