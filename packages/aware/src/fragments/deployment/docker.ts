import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function dockerFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.deployment, "docker")) return null;

  return {
    id: "docker",
    category: "deployment",
    title: "Docker",
    priority: 82,
    content: `## Docker

### Dockerfile Best Practices
- Use multi-stage builds: a \`builder\` stage for compilation/dependencies and a slim \`runner\` stage for the final image
- Copy dependency manifests first (\`package.json\`, \`package-lock.json\`) and install before copying source — leverages layer caching
- Use specific base image tags (e.g., \`node:20-alpine\`) — never use \`latest\` in production
- Run the application as a non-root user: \`RUN adduser --disabled-password appuser && USER appuser\`

### .dockerignore
- Always include a \`.dockerignore\` file to exclude: \`node_modules\`, \`.git\`, \`.env\`, build artifacts, test files
- This reduces build context size and prevents secrets from leaking into the image

### Layer Caching
- Order Dockerfile instructions from least to most frequently changing for optimal caching
- Pin dependency versions in lock files so the install layer is cached until dependencies actually change
- Use \`COPY --from=builder\` to copy only build artifacts into the final stage

### Security
- Never store secrets in the image — use runtime environment variables or secret management
- Scan images for vulnerabilities: \`docker scout cves\` or integrate Trivy/Snyk in CI
- Keep images minimal — use \`alpine\` or \`distroless\` base images to reduce attack surface
- Set \`HEALTHCHECK\` instructions for container orchestrators to monitor application health

### Compose
- Use \`docker-compose.yml\` for local development with all services (DB, cache, app)
- Mount source code as a volume for hot-reloading in development
- Use \`depends_on\` with health checks to control startup order`,
  };
}
