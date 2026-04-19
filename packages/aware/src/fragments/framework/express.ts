import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function expressFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "express")) return null;

  return {
    id: "express",
    category: "framework",
    title: "Express.js",
    priority: 14,
    content: `## Express.js

### Middleware & Request Pipeline
- Middleware executes in registration order — place global middleware (\`cors\`, \`helmet\`, \`express.json()\`) before routes
- Always call \`next()\` in middleware unless sending a response; forgetting this hangs requests
- Use \`app.use()\` for middleware that applies to all routes; use \`router.use()\` for route-group middleware
- Register the error-handling middleware **last** — it must have the signature \`(err, req, res, next)\`

### Route Organization
- Group related routes with \`express.Router()\` and mount on a prefix: \`app.use('/api/users', userRouter)\`
- Keep route handlers thin — delegate business logic to service modules
- Use \`async\` handlers with a wrapper to catch rejected promises: wrap every async handler or use \`express-async-errors\`

### Error Handling
- Throw or \`next(err)\` to pass errors to the error middleware — never silently swallow errors
- Return consistent JSON error responses: \`{ error: { message, code, status } }\`
- Set appropriate HTTP status codes: 400 for bad input, 401 unauthorized, 403 forbidden, 404 not found, 500 server error

### Security
- Always use \`helmet()\` to set secure HTTP headers
- Use \`cors()\` with an explicit origin allowlist — never \`cors({ origin: '*' })\` in production
- Validate and sanitize all request inputs (body, params, query) before processing
- Use rate limiting (\`express-rate-limit\`) on public-facing endpoints

### Request Validation
- Validate \`req.body\`, \`req.params\`, and \`req.query\` at the route level using Zod, Joi, or express-validator
- Return 400 with descriptive messages on validation failure
- Parse numeric params explicitly — \`req.params\` values are always strings`,
  };
}
