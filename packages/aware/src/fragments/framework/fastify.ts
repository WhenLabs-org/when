import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function fastifyFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "fastify")) return null;

  return {
    id: "fastify",
    category: "framework",
    title: "Fastify",
    priority: 14,
    content: `## Fastify

### Plugin Architecture
- Fastify is built on an encapsulated plugin system — register plugins with \`fastify.register()\`
- Plugins have their own scope; decorators and hooks registered inside a plugin don't leak to siblings
- Use \`fastify-plugin\` wrapper to share decorators/hooks across the application scope
- Organize by domain: each feature as a plugin with its own routes, schemas, and hooks

### Schema Validation
- Define JSON Schema for request \`body\`, \`querystring\`, \`params\`, and \`headers\` on each route
- Fastify compiles schemas with \`fast-json-stringify\` for serialization — always define response schemas for performance
- Use \`@fastify/type-provider-typebox\` or \`@fastify/type-provider-zod\` for type-safe schemas
- Invalid requests automatically return 400 with schema violation details

### Hooks Lifecycle
- Use \`onRequest\` for auth checks, \`preValidation\` before schema validation, \`preHandler\` for business-logic guards
- \`onSend\` to modify response before sending; \`onResponse\` for logging/metrics after response
- Hook execution order: onRequest → preParsing → preValidation → preHandler → handler → preSerialization → onSend → onResponse
- Always call \`done()\` in non-async hooks or return a promise in async hooks

### Decorators
- Use \`fastify.decorate()\` to attach utilities to the Fastify instance (available via \`this\` in route handlers)
- Use \`fastify.decorateRequest()\` / \`fastify.decorateReply()\` for per-request/reply properties
- Declare decorators before routes that depend on them

### Error Handling
- Throw \`Fastify.httpErrors.badRequest('message')\` or use \`reply.code(N).send()\`
- Register a global \`setErrorHandler\` for consistent error response formatting
- Use \`setNotFoundHandler\` for custom 404 responses`,
  };
}
