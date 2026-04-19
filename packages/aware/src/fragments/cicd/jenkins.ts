import type { DetectedStack, AwareConfig, Fragment } from "../../types.js";
import { matchesStack } from "../common.js";

export function jenkinsFragment(
  stack: DetectedStack,
  _config: AwareConfig,
): Fragment | null {
  if (!matchesStack(stack.cicd, "jenkins")) return null;

  return {
    id: "jenkins",
    category: "cicd",
    title: "Jenkins",
    priority: 88,
    content: `## Jenkins

### Pipeline Style
- Prefer **declarative pipelines** (\`pipeline { ... }\`) over scripted — declarative has better error messages, stage visualization, and avoids Groovy footguns
- Commit the \`Jenkinsfile\` to the repo and configure the job as "Pipeline from SCM"; avoid UI-edited jobs (they're unreviewable)
- One \`Jenkinsfile\` per repo; use \`parallel\` stages instead of multiple jobs

### Stages & Steps
- Name stages by user intent (\`Install\`, \`Test\`, \`Build\`, \`Deploy\`), not by command
- Each stage's \`steps {}\` block should be short — extract complex logic into shared library functions
- Use \`post { always | success | failure }\` blocks for cleanup and notifications; don't rely on a final try/catch

### Agents
- Pin an \`agent { docker { image 'node:20' } }\` at the pipeline level so every stage runs in the same environment
- For jobs that need different tooling per stage, use per-stage \`agent {}\` blocks — but beware, each agent switch re-clones the repo
- Don't run on the Jenkins master in production setups; use a dedicated agent pool

### Credentials
- Reference Jenkins-stored credentials via \`withCredentials([...])\` — never hard-code tokens in Jenkinsfile
- Choose the right credential type: secret-text for tokens, username-password for registries, ssh-user-private-key for git
- Credentials referenced but not bound leak as empty strings — always check the bound variable is non-empty before use

### Shared Libraries
- Extract repeated stage logic into a Jenkins Shared Library (\`vars/\` and \`src/\` in a dedicated repo)
- Version-pin the library with \`@Library('my-lib@v1.2.0')\`; \`@main\` pulls latest on every build, which is fragile`,
  };
}
