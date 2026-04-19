import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesAny } from "../common.js";

export function pytestFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesAny(stack.testing, "pytest")) return null;

  return {
    id: "pytest",
    category: "testing",
    title: "pytest",
    priority: 62,
    content: `## pytest

### Test Structure
- Name test files as \`test_*.py\` and test functions as \`test_*()\` — pytest discovers them automatically
- Group related tests in classes prefixed with \`Test\`: \`class TestUserService:\`
- Place tests in a \`tests/\` directory mirroring the source structure

### Fixtures
- Use \`@pytest.fixture\` for test setup and teardown — prefer fixtures over setup/teardown methods
- Fixtures with \`yield\` provide the value and run teardown after: \`yield resource; resource.close()\`
- Put shared fixtures in \`conftest.py\` — they are auto-discovered by pytest in the same directory and below
- Use fixture scopes: \`session\` for expensive setup (DB), \`module\` for per-file, \`function\` (default) for per-test

### Parametrize
- Use \`@pytest.mark.parametrize("input,expected", [...])\` to run the same test with multiple inputs
- Combine multiple parametrize decorators for cartesian product of test cases
- Use \`pytest.param(..., id="descriptive-name")\` for readable test IDs in output

### Assertions & Errors
- Use plain \`assert\` statements — pytest rewrites them to show detailed failure information
- Use \`pytest.raises(ExceptionType)\` context manager to assert expected exceptions
- Use \`pytest.approx()\` for floating-point comparisons

### Best Practices
- Use \`-x\` flag to stop on first failure during development; \`-v\` for verbose output
- Mark slow tests with \`@pytest.mark.slow\` and skip with \`-m "not slow"\` for fast feedback loops
- Use \`tmp_path\` fixture for tests that need temporary files — auto-cleaned after tests
- Use \`monkeypatch\` fixture for environment variable and attribute mocking — auto-reverted per test
- Run with \`--tb=short\` in CI for concise tracebacks; \`--tb=long\` locally for debugging`,
  };
}
