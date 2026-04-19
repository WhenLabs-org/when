import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function honoFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "hono")) return null;

  return {
    id: "hono",
    category: "framework",
    title: "Hono",
    priority: 14,
    content: `## Hono

### Routing
- Define routes with \`app.get()\`, \`app.post()\`, \`app.put()\`, \`app.delete()\` — handler receives a context object \`c\`
- Group related routes with \`app.route('/prefix', subApp)\` to keep route files modular
- Use path parameters with \`:param\` syntax: \`app.get('/users/:id', (c) => ...)\`
- Use \`app.all()\` for routes that handle multiple HTTP methods

### Context Object
- Use \`c.json(data)\` to return JSON responses, \`c.text(str)\` for plain text, \`c.html(str)\` for HTML
- Access request data: \`c.req.param('id')\` for path params, \`c.req.query('q')\` for query strings
- Parse request body with \`c.req.json()\` for JSON or \`c.req.formData()\` for form data
- Set headers with \`c.header('key', 'value')\` and status with \`c.status(201)\`

### Middleware
- Register middleware with \`app.use()\` — it runs before matching route handlers
- Middleware receives \`(c, next)\` — call \`await next()\` to continue to the next handler
- Scope middleware to paths: \`app.use('/api/*', authMiddleware)\`
- Built-in middleware: \`cors()\`, \`logger()\`, \`etag()\`, \`compress()\`, \`basicAuth()\`

### Validation
- Use \`@hono/zod-validator\` for request validation: \`zValidator('json', schema)\` as route middleware
- Validate query params, path params, headers, and JSON body with typed schemas
- Validation errors return 400 automatically with descriptive error messages

### Multi-Runtime Support
- Hono runs on Cloudflare Workers, Bun, Deno, Node.js, and AWS Lambda with minimal changes
- Use runtime-specific adapters: \`@hono/node-server\` for Node, native APIs for Workers/Bun/Deno
- Use \`c.env\` to access runtime-specific bindings (e.g., Cloudflare Workers KV, D1)

### Best Practices
- Keep handlers small — extract business logic into separate service modules
- Use \`app.onError()\` for global error handling — return consistent error response shapes
- Use \`app.notFound()\` to customize 404 responses
- Leverage TypeScript — Hono has excellent type inference for routes and middleware`,
  };
}
