import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function reduxToolkitFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.stateManagement, "redux-toolkit")) return null;

  return {
    id: "redux-toolkit",
    category: "state-management",
    title: "Redux Toolkit",
    priority: 45,
    content: `## Redux Toolkit State Management

### Store Setup
- Configure the store with \`configureStore\` — it includes redux-thunk and dev tools by default
- Define feature slices with \`createSlice\` — each slice owns its own state, reducers, and actions
- Organize by feature: \`src/features/<feature>/slice.ts\`
- Export the typed \`RootState\` and \`AppDispatch\` from the store file

### Slices & Reducers
- Use \`createSlice\` for all reducer logic — it uses Immer internally so mutating syntax is safe
- Keep reducers pure — no side effects, no API calls
- Use \`PayloadAction<T>\` to type action payloads
- Use \`prepare\` callbacks for actions that need payload transformation

### Async Logic
- Use \`createAsyncThunk\` for async operations (API calls, etc.)
- Handle all three states: \`pending\`, \`fulfilled\`, \`rejected\` in \`extraReducers\`
- Use RTK Query (\`createApi\`) for data fetching — it handles caching, invalidation, and loading states
- Prefer RTK Query over manual \`createAsyncThunk\` for server state

### Selectors & Hooks
- Use typed hooks: \`useAppSelector\` and \`useAppDispatch\` instead of plain \`useSelector\`/\`useDispatch\`
- Create memoized selectors with \`createSelector\` from reselect for derived data
- Keep selectors co-located with their slice`,
  };
}
