import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function restFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.apiStyle, "rest")) return null;

  return {
    id: "rest",
    category: "api",
    title: "REST API",
    priority: 42,
    content: `## REST API Conventions

### URL & Resource Naming
- Use plural nouns for resources: \`/api/users\`, \`/api/posts\`, \`/api/comments\`
- Use nesting for relationships: \`/api/users/:userId/posts\` — limit to one level of nesting
- Use kebab-case for multi-word paths: \`/api/user-profiles\`
- Use query parameters for filtering, sorting, and pagination: \`?status=active&sort=-createdAt&page=2&limit=20\`

### HTTP Methods
- \`GET\` — retrieve (never mutate); \`POST\` — create; \`PUT\` — full replace; \`PATCH\` — partial update; \`DELETE\` — remove
- \`POST\` returns \`201 Created\` with the created resource and a \`Location\` header
- \`DELETE\` returns \`204 No Content\` on success
- \`GET\` collections return \`200\` with an array (or paginated wrapper)

### Status Codes
- \`200\` OK, \`201\` Created, \`204\` No Content (successful delete/update with no body)
- \`400\` Bad Request (validation errors), \`401\` Unauthorized (not authenticated), \`403\` Forbidden (authenticated but not allowed)
- \`404\` Not Found, \`409\` Conflict (duplicate resource), \`422\` Unprocessable Entity (semantic validation failure)
- \`500\` Internal Server Error — never expose stack traces or internal details to clients

### Error Response Format
- Use a consistent error shape across all endpoints:
  \`\`\`json
  { "error": { "code": "VALIDATION_ERROR", "message": "Email is required", "details": [...] } }
  \`\`\`
- Include machine-readable error codes for client-side handling
- Return an array of field-level errors for validation failures

### Best Practices
- Version your API: \`/api/v1/\` prefix or \`Accept\` header versioning
- Always validate request bodies and query parameters at the route level
- Use consistent envelope for collections: \`{ "data": [...], "meta": { "total", "page", "limit" } }\`
- Idempotency: \`PUT\` and \`DELETE\` should be idempotent; consider idempotency keys for \`POST\``,
  };
}
