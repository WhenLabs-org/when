import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesAny } from "../common.js";

export function cypressFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesAny(stack.testing, "cypress")) return null;

  return {
    id: "cypress",
    category: "testing",
    title: "Cypress",
    priority: 62,
    content: `## Cypress

### Test Structure
- Place E2E tests in \`cypress/e2e/\` with \`.cy.ts\` or \`.cy.js\` extension
- Use \`describe()\` to group related test scenarios; \`it()\` for individual test cases
- Use \`beforeEach()\` for common setup like navigation or login — avoid sharing state between tests
- Each test should be independent — never rely on the execution order of other tests

### Selecting Elements
- Use \`data-cy\` attributes for test selectors: \`cy.get('[data-cy="submit-btn"]')\` — they are resilient to CSS/markup changes
- Use \`cy.contains()\` to find elements by visible text content
- Use \`cy.get()\` with CSS selectors as a fallback — avoid fragile selectors tied to styling classes
- Chain assertions directly: \`cy.get('[data-cy="title"]').should('have.text', 'Hello')\`

### Navigation & Interaction
- Use \`cy.visit('/path')\` to navigate — set the \`baseUrl\` in \`cypress.config.ts\` to avoid repeating the domain
- Use \`cy.click()\`, \`cy.type()\`, \`cy.select()\`, \`cy.check()\` for user interactions
- Cypress automatically waits for elements and retries assertions — avoid adding manual waits or \`cy.wait(N)\`
- Use \`cy.url()\` and \`cy.location()\` to assert navigation state

### Network Stubbing
- Use \`cy.intercept('GET', '/api/users', { fixture: 'users.json' })\` to stub API responses
- Use \`cy.intercept()\` with \`cy.wait('@alias')\` to assert that specific API calls were made
- Alias intercepts for waiting: \`cy.intercept('POST', '/api/login').as('login')\` then \`cy.wait('@login')\`
- Stub error responses to test error handling: \`cy.intercept('GET', '/api/data', { statusCode: 500 })\`

### Custom Commands
- Define reusable commands in \`cypress/support/commands.ts\`: \`Cypress.Commands.add('login', () => { ... })\`
- Use custom commands for repeated flows like authentication, form filling, or common assertions
- Add TypeScript declarations for custom commands in \`cypress/support/index.d.ts\`

### Best Practices
- Avoid conditional testing (\`if element exists, then...\`) — tests should have deterministic outcomes
- Seed test data before each test — use \`cy.task()\` or API calls in \`beforeEach\`
- Test the critical user paths — do not try to cover every edge case with E2E tests
- Use \`cy.session()\` to cache and restore login state across tests for speed`,
  };
}
