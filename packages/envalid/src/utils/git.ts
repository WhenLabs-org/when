import { execSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";

const HOOK_MARKER = "# envalid-hook";

export function getGitRoot(): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function getHooksDir(): string | null {
  const root = getGitRoot();
  if (!root) return null;

  // Check for custom hooks path (e.g. husky)
  try {
    const customPath = execSync("git config core.hooksPath", {
      encoding: "utf-8",
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (customPath) {
      const resolved = customPath.startsWith("/")
        ? customPath
        : join(root, customPath);
      return resolved;
    }
  } catch {
    // No custom hooks path
  }

  return join(root, ".git", "hooks");
}

function getPreCommitPath(): string | null {
  const hooksDir = getHooksDir();
  if (!hooksDir) return null;
  return join(hooksDir, "pre-commit");
}

const HOOK_SCRIPT = `
${HOOK_MARKER}
# Run Envalid validation before commit
npx envalid validate --ci
ENVGUARD_EXIT=$?
if [ $ENVGUARD_EXIT -ne 0 ]; then
  echo "Envalid validation failed. Commit aborted."
  exit 1
fi
# end-envalid-hook
`;

export function isHookInstalled(): boolean {
  const hookPath = getPreCommitPath();
  if (!hookPath || !existsSync(hookPath)) return false;
  const content = readFileSync(hookPath, "utf-8");
  return content.includes(HOOK_MARKER);
}

export function installHook(): {
  installed: boolean;
  message: string;
  hookPath: string | null;
} {
  const gitRoot = getGitRoot();
  if (!gitRoot) {
    return {
      installed: false,
      message: "Not a git repository",
      hookPath: null,
    };
  }

  const hookPath = getPreCommitPath()!;
  const hooksDir = getHooksDir()!;

  if (isHookInstalled()) {
    return {
      installed: false,
      message: "Envalid hook is already installed",
      hookPath,
    };
  }

  // Ensure hooks directory exists
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  if (existsSync(hookPath)) {
    // Append to existing hook
    const existing = readFileSync(hookPath, "utf-8");
    writeFileSync(hookPath, existing + "\n" + HOOK_SCRIPT, "utf-8");
  } else {
    // Create new hook
    writeFileSync(hookPath, "#!/bin/sh\n" + HOOK_SCRIPT, "utf-8");
  }

  chmodSync(hookPath, 0o755);

  return {
    installed: true,
    message: "Pre-commit hook installed",
    hookPath,
  };
}

export function uninstallHook(): {
  removed: boolean;
  message: string;
} {
  const hookPath = getPreCommitPath();
  if (!hookPath || !existsSync(hookPath)) {
    return { removed: false, message: "No pre-commit hook found" };
  }

  const content = readFileSync(hookPath, "utf-8");
  if (!content.includes(HOOK_MARKER)) {
    return { removed: false, message: "Envalid hook not found in pre-commit" };
  }

  // Remove the envalid section
  const cleaned = content.replace(
    /\n?# envalid-hook[\s\S]*?# end-envalid-hook\n?/g,
    "",
  );

  if (cleaned.trim() === "#!/bin/sh" || cleaned.trim() === "") {
    // Hook file would be empty — remove the marker but leave the shebang
    writeFileSync(hookPath, "#!/bin/sh\n", "utf-8");
  } else {
    writeFileSync(hookPath, cleaned, "utf-8");
  }

  return { removed: true, message: "Envalid hook removed" };
}
