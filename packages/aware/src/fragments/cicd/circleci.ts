import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function circleciFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.cicd, "circleci")) return null;

  return {
    id: "circleci",
    category: "cicd",
    title: "CircleCI",
    priority: 88,
    content: `## CircleCI

### Config Structure
- All pipeline config lives in \`.circleci/config.yml\`; start every file with \`version: 2.1\` to unlock orbs and reusable commands
- Split large configs with \`@\` imports OR use \`path-filtering\` + \`continuation\` orb to launch sub-pipelines
- Commit \`config.yml\` changes via the CircleCI \`check\` workflow locally (\`circleci config validate\`) before pushing

### Jobs & Workflows
- One \`job\` per logical unit (test, lint, build, deploy); compose via \`workflows\` to run in parallel where possible
- Use \`requires:\` to express dependencies between jobs instead of chaining steps in one monolithic job
- Name executors (\`docker\`, \`machine\`, \`macos\`) explicitly per job rather than relying on defaults

### Caching
- \`save_cache\` and \`restore_cache\` by lockfile hash (\`{{ checksum "pnpm-lock.yaml" }}\`) — cache keys without version bits produce stale caches on lockfile changes
- Use \`persist_to_workspace\` + \`attach_workspace\` to pass build artifacts between jobs; caches are for package managers, workspaces are for your own output

### Orbs
- Prefer official orbs (\`circleci/node@5\`, \`circleci/aws-cli@4\`) over hand-rolling common tasks; pin a major version
- Third-party orbs must be explicitly approved in org settings — verify before adding

### Secrets
- Store tokens via Contexts (preferred over per-project env vars) so multiple projects share the same secret
- Never \`echo\` secrets in a step; CircleCI's log redaction is best-effort`,
  };
}
