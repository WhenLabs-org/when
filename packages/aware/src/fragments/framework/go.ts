import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function goFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "go")) return null;

  const variant = stack.framework?.variant;
  if (variant && ["gin", "echo", "fiber"].includes(variant)) return null;

  return {
    id: "go",
    category: "framework",
    title: "Go",
    priority: 15,
    content: `## Go Application

### Project Structure
- Use the standard Go project layout: \`cmd/\` for entrypoints, \`internal/\` for private packages, \`pkg/\` only for truly public libraries
- Keep \`main.go\` minimal — parse flags, wire up dependencies, and call into \`internal/\` packages
- Group by domain, not by layer: prefer \`internal/orders/\` over \`internal/handlers/\`, \`internal/services/\`
- Put shared types and interfaces in a top-level \`internal/domain/\` or similar package to avoid import cycles

### Error Handling
- Handle errors explicitly — never ignore returned errors, never use \`_\` for error values
- Wrap errors with context using \`fmt.Errorf("operation failed: %w", err)\` so callers can unwrap with \`errors.Is()\` / \`errors.As()\`
- Define sentinel errors (\`var ErrNotFound = errors.New("not found")\`) for errors callers need to check
- Return errors rather than logging and continuing — let the caller decide how to handle them
- Use \`defer\` for cleanup, not for error handling flow

### Naming Conventions
- Use short, concise names — \`srv\` not \`myServer\`, \`ctx\` not \`context\`, \`err\` not \`error\`
- Exported names should be descriptive; unexported names can be terse since scope is limited
- Interfaces should be named by what they do: \`Reader\`, \`Stringer\`, \`Handler\` — single-method interfaces end in \`-er\`
- Avoid stuttering: \`http.Server\` not \`http.HTTPServer\`, \`user.Service\` not \`user.UserService\`
- Package names are lowercase, single words — no underscores or camelCase

### Module Management
- Run \`go mod tidy\` to keep \`go.mod\` and \`go.sum\` clean — commit both files
- Pin direct dependencies; let indirect ones float unless there's a reason to pin
- Use \`go work\` for multi-module repos (monorepos) instead of replace directives
- Prefer the standard library — only add dependencies when they provide significant value

### Concurrency
- Use goroutines and channels, but prefer \`sync.WaitGroup\` or \`errgroup.Group\` for structured concurrency
- Always pass \`context.Context\` as the first parameter to functions that do I/O or may block
- Use \`context.WithCancel\` / \`context.WithTimeout\` for cancellation and deadlines
- Protect shared state with \`sync.Mutex\` — keep critical sections small
- Use \`chan struct{}\` for signaling, not \`chan bool\`

### Testing
- Test files live next to the code: \`foo.go\` → \`foo_test.go\`
- Use table-driven tests with \`t.Run()\` for subtests
- Use \`testify/assert\` or plain \`if\` checks — keep test assertions simple and readable
- Use \`t.Helper()\` in test helper functions so failures report the caller's line
- Use \`go test ./...\` to run all tests; use \`-race\` flag to detect race conditions`,
  };
}
