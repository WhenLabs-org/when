import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesAny } from "../common.js";

export function playwrightFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesAny(stack.testing, "playwright")) return null;

  return {
    id: "playwright",
    category: "testing",
    title: "Playwright",
    priority: 62,
    content: `## Playwright (E2E Testing)

### Test Structure
- Place e2e tests in an \`e2e/\` or \`tests/\` directory, separate from unit tests
- Use \`test.describe()\` to group related scenarios; \`test()\` for individual cases
- Each test should be independent — don't rely on state from previous tests
- Use \`test.beforeEach\` for common setup (navigation, auth state)

### Locator Strategy
- Prefer accessible locators in this order: \`page.getByRole()\` > \`page.getByText()\` > \`page.getByLabel()\` > \`page.getByTestId()\`
- Never use CSS/XPath selectors for dynamic content — they break on refactors
- Chain locators for scoping: \`page.getByRole('dialog').getByRole('button', { name: 'Confirm' })\`
- Use \`locator.filter()\` to narrow results: \`page.getByRole('listitem').filter({ hasText: 'Active' })\`

### Page Object Model
- Create page object classes that encapsulate page interactions and locators
- Page objects return data or other page objects — never make assertions inside them
- Keep locators in the page object; tests read as business-level steps

### Assertions & Waiting
- Use \`expect(locator).toBeVisible()\`, \`toHaveText()\`, \`toHaveValue()\` — these auto-wait and retry
- Avoid manual \`page.waitForTimeout()\` — use auto-waiting assertions or \`page.waitForResponse()\` for network events
- Use \`expect(page).toHaveURL()\` to assert navigation; \`toHaveTitle()\` for page title checks

### Configuration
- Configure in \`playwright.config.ts\`: base URL, browsers, retries, and parallel workers
- Use \`projects\` to run tests across Chromium, Firefox, and WebKit
- Use \`storageState\` for authenticated test contexts — generate auth state in a global setup
- Use \`--ui\` mode for debugging; \`--trace on\` to capture trace files for CI failure investigation`,
  };
}
