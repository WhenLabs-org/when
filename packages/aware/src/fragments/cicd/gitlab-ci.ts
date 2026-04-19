import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function gitlabCiFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.cicd, "gitlab-ci")) return null;

  return {
    id: "gitlab-ci",
    category: "cicd",
    title: "GitLab CI",
    priority: 86,
    content: `## GitLab CI/CD

### Configuration
- Pipeline config lives in \`.gitlab-ci.yml\` at the repo root
- Define stages in order: \`stages: [build, test, deploy]\`
- Use \`include\` to split large configs into multiple files or reference shared templates
- Use \`extends\` for job inheritance to reduce duplication

### Jobs
- Use \`rules:\` (not \`only:\`/\`except:\`) for conditional job execution
- Cache dependencies between jobs with \`cache:\` and use \`key:\` based on lockfile hash
- Use \`artifacts:\` to pass build outputs between stages
- Use \`needs:\` for DAG-based pipelines to run jobs out of stage order when possible

### Best Practices
- Use CI/CD variables (Settings > CI/CD > Variables) for secrets — never commit them
- Use \`interruptible: true\` on jobs that can be safely cancelled for new pipeline runs
- Pin Docker image versions in \`image:\` — avoid \`latest\` tag
- Use merge request pipelines (\`rules: - if: $CI_MERGE_REQUEST_IID\`) for PR-scoped checks`,
  };
}
