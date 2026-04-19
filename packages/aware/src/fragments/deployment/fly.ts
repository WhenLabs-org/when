import type {
  DetectedStack,
  AwareConfig,
  Fragment,
} from "../../types.js";
import { matchesStack } from "../common.js";

export function flyFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.deployment, "fly")) return null;

  return {
    id: "fly",
    category: "deployment",
    title: "Fly.io",
    priority: 81,
    content: `## Fly.io Deployment

### Configuration
- App configuration lives in \`fly.toml\` — defines app name, build settings, services, and health checks
- Set environment variables with \`fly secrets set KEY=value\` — secrets are encrypted and available at runtime
- Use \`fly secrets list\` to see configured secrets (values are hidden) — \`fly secrets unset KEY\` to remove
- Configure HTTP services in \`fly.toml\` under \`[[services]]\` with port, protocol, and health check settings

### Deployment
- Deploy with \`fly deploy\` — it builds the Docker image (or uses a Dockerfile) and rolls out to all regions
- Use \`fly deploy --strategy rolling\` for zero-downtime deployments (default) or \`--strategy immediate\` for faster deploys
- Monitor deployment status with \`fly status\` and \`fly logs\`
- Use \`fly releases\` to view deployment history — rollback with \`fly deploy --image\` pointing to a previous release

### Multi-Region & Scaling
- Add regions with \`fly regions add ord ams\` — remove with \`fly regions remove\`
- Scale instances with \`fly scale count N\` or per-region: \`fly scale count 2 --region ord\`
- Use \`fly scale vm\` to change VM size (shared-cpu, performance, dedicated)
- Use \`fly.toml\` \`[env]\` section for non-secret environment variables shared across regions

### Persistent Storage
- Create volumes with \`fly volumes create data_vol --region ord --size 10\` for persistent storage
- Mount volumes in \`fly.toml\` under \`[mounts]\` — volumes are region-specific and persist across deploys
- Volumes survive app restarts but are tied to a single region — plan accordingly for multi-region apps

### Debugging
- Use \`fly ssh console\` to get a shell into a running instance for debugging
- Use \`fly logs\` to stream application logs in real time
- Use \`fly doctor\` to diagnose common configuration issues
- Use \`fly ping\` to check connectivity to your app from different regions`,
  };
}
