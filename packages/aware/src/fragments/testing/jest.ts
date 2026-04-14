import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesAny } from "../common.js";

export function jestFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesAny(stack.testing, "jest")) return null;

  return {
    id: "jest",
    category: "testing",
    title: "Jest",
    priority: 60,
    content: `## Jest

### Test Structure
- Name test files as \`*.test.ts\` or \`*.test.tsx\`; place in \`__tests__/\` or colocated with source
- Use \`describe()\` blocks to group related tests; \`it()\` or \`test()\` for individual cases
- Use \`expect()\` with specific matchers: \`toEqual\` for deep equality, \`toBe\` for strict reference equality

### Mocking
- Use \`jest.mock('module')\` at the file top to mock entire modules — auto-hoisted above imports
- Use \`jest.spyOn(object, 'method')\` to spy on existing methods; restore with \`jest.restoreAllMocks()\`
- Use \`jest.fn()\` for standalone mock functions; chain \`.mockReturnValue()\` or \`.mockResolvedValue()\` for async
- Put shared mocks in \`__mocks__/\` directory adjacent to the module or at project root for node_modules

### Async Testing
- Return the promise or use \`async/await\` — Jest fails the test if the promise rejects
- Use \`expect(asyncFn()).resolves.toEqual(value)\` or \`rejects.toThrow()\` for async assertions
- Set \`jest.setTimeout(ms)\` for tests that legitimately need more time (API integration tests)

### Configuration
- Configure in \`jest.config.ts\` or the \`jest\` field in \`package.json\`
- Use \`setupFilesAfterFramework\` for global matchers (e.g., \`@testing-library/jest-dom\`)
- Configure \`moduleNameMapper\` for path aliases matching \`tsconfig.json\` paths
- Use \`--coverage\` flag; configure thresholds in \`coverageThreshold\` to enforce minimums

### Best Practices
- Clear all mocks in \`beforeEach\` with \`jest.clearAllMocks()\` to prevent test pollution
- Avoid snapshot tests for dynamic content — they become noisy and get rubber-stamped
- Test error paths: verify functions throw or reject with expected error types and messages`,
  };
}
