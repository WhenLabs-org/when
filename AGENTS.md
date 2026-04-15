# AGENTS.md

## Context
The WhenLabs developer toolkit — 6 tools, one install

## Tech Stack
- **Language**: TypeScript 5.7
- **Testing**: Vitest 3.0
- **Package Manager**: npm
- **CI/CD**: GitHub Actions
- **Bundler**: tsup 8.0

## Conventions
### GitHub Actions

### Workflow Files
- Workflows live in `.github/workflows/` as YAML files
- Use descriptive names for workflow files (e.g., `ci.yml`, `deploy.yml`, `release.yml`)
- Pin action versions to a full SHA for security, not just a tag (e.g., `actions/checkout@<sha>`)
- Use `workflow_dispatch` for manually triggerable workflows

### Best Practices
- Use job-level `concurrency` to cancel in-progress runs on the same branch
- Cache dependencies with `actions/cache` or built-in caching (e.g., `actions/setup-node` with `cache: 'pnpm'`)
- Use matrix strategies for testing across multiple versions/platforms
- Store secrets in GitHub Secrets — never hardcode credentials in workflow files
- Use `needs:` to define job dependencies and control execution order
- Use reusable workflows (`workflow_call`) to share CI logic across repos

### Performance
- Use `paths` and `paths-ignore` filters to skip unnecessary workflow runs
- Split long workflows into parallel jobs where possible
- Use larger runners for compute-heavy tasks (builds, E2E tests)

### Naming
- **files**: kebab-case
- **functions**: camelCase
- **constants**: UPPER_SNAKE_CASE

### Imports
- **style**: named imports preferred
- **order**: third-party,local,types

## Testing
## Vitest

### Test Structure
- Name test files as `*.test.ts` or `*.test.tsx`, colocated next to the source file or in a `__tests__/` directory
- Use `describe()` to group related tests; `it()` or `test()` for individual cases
- Use `expect()` assertions — prefer specific matchers (`toEqual`, `toContain`, `toThrow`) over generic `toBeTruthy`

### Mocking
- Use `vi.mock('module')` at the top of the file to mock entire modules — it is hoisted automatically
- Use `vi.spyOn(object, 'method')` to observe calls without replacing implementation
- Use `vi.fn()` for standalone mock functions; assert with `toHaveBeenCalledWith()`
- Reset mocks between tests: `vi.clearAllMocks()` in `beforeEach` or use `mockReset: true` in config

### React Component Testing
- Use `@testing-library/react` with `render()`, `screen`, and `userEvent`
- Query elements by accessible role first: `screen.getByRole('button', { name: /submit/i })`
- Use `userEvent` (not `fireEvent`) for realistic user interactions
- Use `waitFor()` for async state changes; avoid arbitrary timeouts

### Configuration
- Configure in `vitest.config.ts` or the `test` field in `vite.config.ts`
- Use `setupFiles` for global setup (e.g., `@testing-library/jest-dom` matchers)
- Enable coverage with `vitest run --coverage` using `@vitest/coverage-v8` or `@vitest/coverage-istanbul`

### Best Practices
- Keep tests deterministic — mock dates, randomness, and external APIs
- Test behavior, not implementation — assert on output/DOM state, not internal variables
- Use `test.each()` for parameterized tests with multiple input/output combinations

## Project Structure
| Path | Description |
| --- | --- |
| `src/utils/` | Utility functions and helpers |
