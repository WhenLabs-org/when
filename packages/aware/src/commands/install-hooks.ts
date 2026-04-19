import * as path from "node:path";
import * as fs from "node:fs/promises";
import { fileExists, writeFile, ensureDir } from "../utils/fs.js";
import { log } from "../utils/logger.js";
import { loadConfig } from "../utils/config.js";
import type { AwareConfig } from "../types.js";

export type CiProvider = "github-actions" | "gitlab-ci" | "circleci";

type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

interface InstallHooksOptions {
  /** Emit a CI workflow snippet instead of (or in addition to) a git hook. */
  ci?: CiProvider;
  /** Overwrite an existing hook instead of skipping. */
  force?: boolean;
}

const PRE_COMMIT_SCRIPT = `#!/usr/bin/env sh
# Installed by \`aware install-hooks\`. Blocks commits that would drift
# the AI context files from .aware.json. Run \`aware sync\` to reconcile.
exec aware diff --check --quiet
`;

const HUSKY_LINE = "aware diff --check --quiet";

// Marker regex used by the Husky append path to scrub any previously-
// installed aware line(s) before appending a fresh one. Matches the full
// line including a leading optional `exec `/` pnpm exec ` etc.
const HUSKY_AWARE_LINE_RE = /^.*\baware\s+diff\s+--check\b.*$/gm;

export async function installHooksCommand(
  options: InstallHooksOptions = {},
): Promise<void> {
  const projectRoot = process.cwd();

  if (options.ci) {
    const packageManager = await detectPackageManager(projectRoot);
    renderCiSnippet(options.ci, packageManager);
    return;
  }

  const huskyDir = path.join(projectRoot, ".husky");
  const gitPath = path.join(projectRoot, ".git");

  if (await fileExists(huskyDir)) {
    await installHuskyHook(huskyDir, options.force ?? false);
    return;
  }

  const gitKind = await classifyGitDir(gitPath);
  if (gitKind === "directory") {
    await installGitHook(gitPath, options.force ?? false);
    return;
  }
  if (gitKind === "file") {
    log.error(
      "`.git` is a file (worktree or submodule), not a directory. " +
        "Install Husky (pnpm add -D husky && npx husky init) and re-run " +
        "`aware install-hooks`, or add `aware diff --check --quiet` to your " +
        "worktree's hooks manually.",
    );
    process.exit(1);
  }

  log.error(
    "No .git or .husky directory found. Run `aware install-hooks` from a " +
      "git repository, or use `--ci <provider>` to print a CI workflow snippet.",
  );
  process.exit(1);
}

async function classifyGitDir(
  gitPath: string,
): Promise<"directory" | "file" | "missing"> {
  try {
    const stat = await fs.stat(gitPath);
    if (stat.isDirectory()) return "directory";
    if (stat.isFile()) return "file";
    return "missing";
  } catch {
    return "missing";
  }
}

async function installGitHook(gitDir: string, force: boolean): Promise<void> {
  const hooksDir = path.join(gitDir, "hooks");
  await ensureDir(hooksDir);
  const hookPath = path.join(hooksDir, "pre-commit");

  if ((await fileExists(hookPath)) && !force) {
    log.warn(`${hookPath} already exists. Re-run with --force to overwrite.`);
    return;
  }

  await writeFile(hookPath, PRE_COMMIT_SCRIPT);
  await safeChmod(hookPath, 0o755);
  log.success(`Installed pre-commit hook at ${hookPath}`);
  log.dim("The hook runs `aware diff --check`. A nonzero exit blocks the commit.");
}

async function installHuskyHook(huskyDir: string, force: boolean): Promise<void> {
  const hookPath = path.join(huskyDir, "pre-commit");
  const existing = await readIfExists(hookPath);

  // Fresh hook: just write our line.
  if (existing === null) {
    await writeFile(hookPath, HUSKY_LINE + "\n");
    await safeChmod(hookPath, 0o755);
    log.success(`Installed Husky pre-commit hook at ${hookPath}`);
    return;
  }

  // Already installed? `--force` still rewrites cleanly so the user can
  // normalize after hand-edits without doubling up.
  const alreadyPresent = HUSKY_AWARE_LINE_RE.test(existing);
  HUSKY_AWARE_LINE_RE.lastIndex = 0; // reset regex state after `.test`

  if (alreadyPresent && !force) {
    log.info("Husky pre-commit already runs `aware diff --check` — no changes.");
    return;
  }

  // Scrub any existing aware line(s) and append exactly one canonical line.
  // This is how `--force` works too: a single line is always the goal, no
  // matter how many times the user re-runs install-hooks.
  const scrubbed = existing.replace(HUSKY_AWARE_LINE_RE, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  const next =
    (scrubbed.length > 0 ? scrubbed + "\n" : "") + HUSKY_LINE + "\n";
  await writeFile(hookPath, next);
  log.success(
    alreadyPresent
      ? `Reinstalled drift check in ${hookPath}`
      : `Appended drift check to ${hookPath}`,
  );
}

async function safeChmod(filePath: string, mode: number): Promise<void> {
  try {
    await fs.chmod(filePath, mode);
  } catch (err) {
    // chmod is a no-op on Windows and some filesystems; don't let it
    // abort a successful hook install.
    log.warn(
      `Installed ${filePath} but couldn't chmod it (${(err as Error).message}). ` +
        `You may need to \`chmod +x\` it manually.`,
    );
  }
}

function renderCiSnippet(
  provider: CiProvider,
  packageManager: PackageManager,
): void {
  const snippet = snippetFor(provider, packageManager);
  log.header(`\naware CI snippet (${provider}, ${packageManager}):\n`);
  console.log(snippet);
  log.dim(
    "Copy the snippet into your CI config. `aware diff --check` exits 0 on " +
      "clean, 1 on drift, 2 on tampering — use as a required status check.",
  );
}

async function detectPackageManager(projectRoot: string): Promise<PackageManager> {
  // Prefer the config when present — it's user-authoritative.
  let config: AwareConfig | null = null;
  try {
    config = await loadConfig(projectRoot);
  } catch {
    config = null;
  }
  const declared = config?.stack.packageManager;
  if (declared && declared.startsWith("npm")) return "npm";
  if (declared && declared.startsWith("yarn")) return "yarn";
  if (declared && declared.startsWith("bun")) return "bun";
  if (declared && declared.startsWith("pnpm")) return "pnpm";

  // Fall back to lockfile sniffing.
  if (await fileExists(path.join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(path.join(projectRoot, "yarn.lock"))) return "yarn";
  if (await fileExists(path.join(projectRoot, "bun.lockb"))) return "bun";
  if (await fileExists(path.join(projectRoot, "package-lock.json"))) return "npm";
  return "pnpm";
}

interface SnippetParts {
  setup: string[];
  install: string;
  run: string;
}

function snippetPartsFor(pm: PackageManager): SnippetParts {
  switch (pm) {
    case "pnpm":
      return {
        setup: ["- uses: pnpm/action-setup@v4"],
        install: "pnpm install --frozen-lockfile",
        run: "pnpm aware diff --check",
      };
    case "yarn":
      return {
        setup: [],
        install: "yarn install --frozen-lockfile",
        run: "yarn aware diff --check",
      };
    case "bun":
      return {
        setup: ["- uses: oven-sh/setup-bun@v2"],
        install: "bun install --frozen-lockfile",
        run: "bun run aware diff --check",
      };
    case "npm":
      return {
        setup: [],
        install: "npm ci",
        run: "npx aware diff --check",
      };
  }
}

function snippetFor(provider: CiProvider, pm: PackageManager): string {
  const parts = snippetPartsFor(pm);

  switch (provider) {
    case "github-actions": {
      const extraSetup = parts.setup
        .map((line) => `      ${line}`)
        .join("\n");
      return (
        `# .github/workflows/aware.yml\n` +
        `name: aware drift check\n` +
        `on:\n` +
        `  pull_request:\n` +
        `  push:\n` +
        `    branches: [main]\n` +
        `jobs:\n` +
        `  aware:\n` +
        `    runs-on: ubuntu-latest\n` +
        `    steps:\n` +
        `      - uses: actions/checkout@v4\n` +
        (extraSetup ? `${extraSetup}\n` : "") +
        `      - uses: actions/setup-node@v4\n` +
        `        with:\n` +
        `          node-version: 20\n` +
        (pm === "pnpm" ? `          cache: pnpm\n` : pm === "yarn" ? `          cache: yarn\n` : pm === "npm" ? `          cache: npm\n` : "") +
        `      - run: ${parts.install}\n` +
        `      - run: ${parts.run}\n`
      );
    }
    case "gitlab-ci": {
      const corepack = pm === "npm" ? "" : "    - corepack enable\n";
      return (
        `# .gitlab-ci.yml fragment\n` +
        `aware-drift:\n` +
        `  image: node:20\n` +
        `  script:\n` +
        corepack +
        `    - ${parts.install}\n` +
        `    - ${parts.run}\n`
      );
    }
    case "circleci": {
      const corepack = pm === "npm" ? "" : "      - run: corepack enable\n";
      return (
        `# .circleci/config.yml fragment\n` +
        `version: 2.1\n` +
        `jobs:\n` +
        `  aware-drift:\n` +
        `    docker:\n` +
        `      - image: cimg/node:20.0\n` +
        `    steps:\n` +
        `      - checkout\n` +
        corepack +
        `      - run: ${parts.install}\n` +
        `      - run: ${parts.run}\n`
      );
    }
  }
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
