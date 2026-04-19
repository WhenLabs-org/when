import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";

export function goWebFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (stack.framework?.name !== "go") return null;
  const variant = stack.framework.variant;
  if (!variant || !["gin", "echo", "fiber"].includes(variant)) return null;

  const frameworkGuide: Record<string, string> = {
    gin: `### Gin
- Define routes with \`r.GET()\`, \`r.POST()\`, etc. — use route groups (\`r.Group()\`) for shared prefixes/middleware
- Use \`c.ShouldBindJSON()\` for request body parsing with struct validation tags
- Use \`c.JSON()\` for JSON responses — always set appropriate status codes
- Use \`gin.H{}\` for quick inline JSON maps in responses
- Apply middleware with \`r.Use()\` — order matters (logging, recovery, auth, then routes)`,
    echo: `### Echo
- Define routes with \`e.GET()\`, \`e.POST()\`, etc. — use groups (\`e.Group()\`) for route prefixes
- Use \`c.Bind()\` for request body parsing with struct tags
- Use \`c.JSON()\` for JSON responses — always include status codes
- Use middleware with \`e.Use()\` — Echo has built-in CORS, recover, logger, rate limiter
- Use \`echo.Context\` for request/response handling — extend it for custom context`,
    fiber: `### Fiber
- Define routes with \`app.Get()\`, \`app.Post()\`, etc. — use groups (\`app.Group()\`) for prefixes
- Use \`c.BodyParser()\` for request parsing into structs
- Use \`c.JSON()\` for JSON responses — Fiber is inspired by Express, so patterns feel familiar
- Use middleware with \`app.Use()\` — Fiber has built-in logger, CORS, limiter, cache
- Fiber uses fasthttp (not net/http) — some net/http middleware won't work directly`,
  };

  return {
    id: "go-web",
    category: "framework",
    title: `Go (${variant.charAt(0).toUpperCase() + variant.slice(1)})`,
    priority: 12,
    content: `## Go Web Application

### Project Structure
- Use the standard Go project layout: \`cmd/\` for entrypoints, \`internal/\` for private packages
- Organize handlers by domain: \`internal/handlers/\`, \`internal/services/\`, \`internal/models/\`
- Keep \`main.go\` minimal — wire up dependencies and start the server

${frameworkGuide[variant] ?? ""}

### General Go Patterns
- Use interfaces for dependency injection — define interfaces where they're consumed, not implemented
- Use \`context.Context\` for request-scoped values, cancellation, and timeouts
- Handle errors explicitly — never ignore returned errors, wrap with \`fmt.Errorf("context: %w", err)\`
- Use struct tags (\`json\`, \`validate\`, \`db\`) for serialization and validation
- Use \`go vet\`, \`staticcheck\`, and \`golangci-lint\` for code quality`,
  };
}
