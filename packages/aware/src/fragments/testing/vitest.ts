import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesAny } from "../common.js";

export function vitestFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesAny(stack.testing, "vitest")) return null;

  return {
    id: "vitest",
    category: "testing",
    title: "Vitest",
    priority: 60,
    content: `## Vitest

### Test Structure
- Name test files as \`*.test.ts\` or \`*.test.tsx\`, colocated next to the source file or in a \`__tests__/\` directory
- Use \`describe()\` to group related tests; \`it()\` or \`test()\` for individual cases
- Use \`expect()\` assertions — prefer specific matchers (\`toEqual\`, \`toContain\`, \`toThrow\`) over generic \`toBeTruthy\`

### Mocking
- Use \`vi.mock('module')\` at the top of the file to mock entire modules — it is hoisted automatically
- Use \`vi.spyOn(object, 'method')\` to observe calls without replacing implementation
- Use \`vi.fn()\` for standalone mock functions; assert with \`toHaveBeenCalledWith()\`
- Reset mocks between tests: \`vi.clearAllMocks()\` in \`beforeEach\` or use \`mockReset: true\` in config

### React Component Testing
- Use \`@testing-library/react\` with \`render()\`, \`screen\`, and \`userEvent\`
- Query elements by accessible role first: \`screen.getByRole('button', { name: /submit/i })\`
- Use \`userEvent\` (not \`fireEvent\`) for realistic user interactions
- Use \`waitFor()\` for async state changes; avoid arbitrary timeouts

### Configuration
- Configure in \`vitest.config.ts\` or the \`test\` field in \`vite.config.ts\`
- Use \`setupFiles\` for global setup (e.g., \`@testing-library/jest-dom\` matchers)
- Enable coverage with \`vitest run --coverage\` using \`@vitest/coverage-v8\` or \`@vitest/coverage-istanbul\`

### Best Practices
- Keep tests deterministic — mock dates, randomness, and external APIs
- Test behavior, not implementation — assert on output/DOM state, not internal variables
- Use \`test.each()\` for parameterized tests with multiple input/output combinations`,
  };
}
