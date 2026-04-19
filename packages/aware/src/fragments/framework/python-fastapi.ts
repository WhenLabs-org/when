import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function pythonFastapiFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.framework, "fastapi")) return null;

  return {
    id: "python-fastapi",
    category: "framework",
    title: "FastAPI (Python)",
    priority: 15,
    content: `## FastAPI

### Request Handling
- Define endpoints with \`@app.get()\`, \`@app.post()\`, etc. — use \`async def\` for all handlers
- Use \`APIRouter\` to group related endpoints into modules and mount with \`app.include_router(router, prefix="/api/v1")\`
- Path parameters are typed in the function signature: \`async def get_user(user_id: int)\`
- Query parameters are function params with defaults; use \`Query()\` for validation constraints

### Pydantic Models
- Define request bodies and response schemas as Pydantic \`BaseModel\` classes
- Use \`Field()\` for validation constraints, descriptions, and examples
- Use \`response_model\` parameter on endpoints to control serialized output shape
- Create separate models for create, update, and response (e.g., \`UserCreate\`, \`UserUpdate\`, \`UserResponse\`)

### Dependency Injection
- Use \`Depends()\` for shared logic: database sessions, auth checks, pagination params
- Dependencies can be \`async def\` functions or classes with \`__call__\`
- Use \`yield\` dependencies for setup/teardown patterns (e.g., DB session lifecycle)
- Dependencies are cached per-request by default — same dependency used twice returns same instance

### Error Handling
- Raise \`HTTPException(status_code=404, detail="Not found")\` for expected errors
- Register custom exception handlers with \`@app.exception_handler(CustomError)\` for domain errors
- Return consistent error shape: \`{ "detail": "message" }\` or a structured error model
- Use status codes correctly: 201 for created, 204 for no content, 422 for validation errors

### Server & Deployment
- Run with \`uvicorn app.main:app --reload\` in development
- Use \`--workers N\` or Gunicorn with \`uvicorn.workers.UvicornWorker\` in production
- Automatic OpenAPI docs at \`/docs\` (Swagger) and \`/redoc\` — keep schemas accurate for consumers
- Use lifespan events (\`@asynccontextmanager\`) for startup/shutdown logic (DB pools, caches)`,
  };
}
