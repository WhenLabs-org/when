import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function githubActionsFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.cicd, "github-actions")) return null;

  return {
    id: "github-actions",
    category: "cicd",
    title: "GitHub Actions",
    priority: 86,
    content: `## GitHub Actions CI/CD

### Workflow Files
- Workflows live in \`.github/workflows/\` as YAML files
- Use descriptive names for workflow files (e.g., \`ci.yml\`, \`deploy.yml\`, \`release.yml\`)
- Pin action versions to a full SHA for security, not just a tag (e.g., \`actions/checkout@<sha>\`)
- Use \`workflow_dispatch\` for manually triggerable workflows

### Best Practices
- Use job-level \`concurrency\` to cancel in-progress runs on the same branch
- Cache dependencies with \`actions/cache\` or built-in caching (e.g., \`actions/setup-node\` with \`cache: 'pnpm'\`)
- Use matrix strategies for testing across multiple versions/platforms
- Store secrets in GitHub Secrets — never hardcode credentials in workflow files
- Use \`needs:\` to define job dependencies and control execution order
- Use reusable workflows (\`workflow_call\`) to share CI logic across repos

### Performance
- Use \`paths\` and \`paths-ignore\` filters to skip unnecessary workflow runs
- Split long workflows into parallel jobs where possible
- Use larger runners for compute-heavy tasks (builds, E2E tests)`,
  };
}
