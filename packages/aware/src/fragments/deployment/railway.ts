import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function railwayFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.deployment, "railway")) return null;

  return {
    id: "railway",
    category: "deployment",
    title: "Railway",
    priority: 82,
    content: `## Railway Deployment

### Configuration
- Use \`railway.json\` or \`railway.toml\` to configure build and deploy settings
- Railway uses Nixpacks for automatic build detection — it identifies the language, framework, and build commands
- Override auto-detected settings by specifying \`buildCommand\` and \`startCommand\` in \`railway.json\`
- Configure a custom Dockerfile by setting the \`dockerfilePath\` in project settings

### Environment Variables
- Set environment variables in the Railway dashboard under the service's Variables tab
- Use variable references to share values across services (e.g., \`VARIABLE_NAME\` from another service)
- Railway provides built-in variables like \`PORT\`, \`RAILWAY_ENVIRONMENT\`, and database connection URLs
- Use \`railway run\` locally to execute commands with production environment variables injected

### Deployment
- Deploys trigger automatically on push to the connected GitHub branch
- Each push creates an isolated deployment — rollback by redeploying a previous commit
- Use Railway's preview environments for PRs — each PR gets its own ephemeral deployment
- Monitor deployment logs in the dashboard or with \`railway logs\`

### Services & Databases
- Add databases (PostgreSQL, MySQL, Redis, MongoDB) as services from the Railway dashboard with one click
- Database connection URLs are automatically injected as environment variables
- Use Railway's internal networking for service-to-service communication via private URLs
- Scale services horizontally by adjusting replica count in service settings

### Best Practices
- Use \`railway.json\` for reproducible configuration rather than relying solely on dashboard settings
- Set a health check endpoint to ensure Railway routes traffic only to healthy instances
- Use \`railway link\` to connect your local project to a Railway project for CLI operations
- Monitor resource usage in the dashboard — Railway charges based on actual compute and memory usage`,
  };
}
