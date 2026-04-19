import type { StackItem } from "../types.js";
import { fileExists } from "../utils/fs.js";
import * as path from "node:path";
import fg from "fast-glob";

export async function detectCicd(projectRoot: string): Promise<StackItem | null> {
  // GitHub Actions
  const ghWorkflows = await fg("*.yml", {
    cwd: path.join(projectRoot, ".github", "workflows"),
    onlyFiles: true,
  }).catch(() => []);

  if (ghWorkflows.length > 0) {
    return {
      name: "github-actions",
      version: null,
      variant: null,
      confidence: 0.95,
      detectedFrom: ".github/workflows/",
    };
  }

  // GitLab CI
  if (await fileExists(path.join(projectRoot, ".gitlab-ci.yml"))) {
    return {
      name: "gitlab-ci",
      version: null,
      variant: null,
      confidence: 0.95,
      detectedFrom: ".gitlab-ci.yml",
    };
  }

  // CircleCI
  if (await fileExists(path.join(projectRoot, ".circleci", "config.yml"))) {
    return {
      name: "circleci",
      version: null,
      variant: null,
      confidence: 0.95,
      detectedFrom: ".circleci/config.yml",
    };
  }

  // Jenkins
  if (await fileExists(path.join(projectRoot, "Jenkinsfile"))) {
    return {
      name: "jenkins",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: "Jenkinsfile",
    };
  }

  // Travis CI
  if (await fileExists(path.join(projectRoot, ".travis.yml"))) {
    return {
      name: "travis-ci",
      version: null,
      variant: null,
      confidence: 0.90,
      detectedFrom: ".travis.yml",
    };
  }

  return null;
}
