import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function nestjsFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "nestjs")) return null;

  return {
    id: "nestjs",
    category: "framework",
    title: "NestJS",
    priority: 12,
    content: `## NestJS

### Architecture
- Organize by modules: each feature module encapsulates its controllers, services, and entities
- Use the NestJS CLI (\`nest generate\`) for scaffolding modules, controllers, services, guards
- Follow the Modules → Controllers → Services → Repositories layered pattern
- Use \`@Global()\` sparingly — only for truly global modules like config or database

### Controllers & Routing
- Use decorators for HTTP methods: \`@Get()\`, \`@Post()\`, \`@Put()\`, \`@Delete()\`, \`@Patch()\`
- Use \`@Body()\`, \`@Param()\`, \`@Query()\` for extracting request data
- Use DTOs (Data Transfer Objects) with \`class-validator\` decorators for input validation
- Use \`@UseGuards()\`, \`@UseInterceptors()\`, \`@UsePipes()\` for cross-cutting concerns

### Services & Dependency Injection
- Services are \`@Injectable()\` — Nest manages their lifecycle automatically
- Use constructor injection — Nest resolves dependencies from the module's providers
- Use custom providers (\`useFactory\`, \`useValue\`, \`useClass\`) for advanced DI scenarios

### Best Practices
- Use \`ConfigModule.forRoot()\` with \`@nestjs/config\` for environment-based configuration
- Use guards for authentication/authorization, interceptors for response transformation
- Use exception filters for centralized error handling — extend \`HttpException\`
- Use Pipes for validation and transformation (e.g., \`ValidationPipe\` globally)
- Use \`@nestjs/swagger\` to auto-generate OpenAPI docs from decorators`,
  };
}
