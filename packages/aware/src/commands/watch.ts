import * as path from "node:path";
import * as fs from "node:fs";
import { detectStack, stackToConfig } from "../detectors/index.js";
import { resolveFragments } from "../fragments/index.js";
import { generateAll } from "../generators/index.js";
import { loadConfig, saveConfig, computeDetectionHash } from "../utils/config.js";
import { writeFile } from "../utils/fs.js";
import { log } from "../utils/logger.js";

interface WatchOptions {
  autoSync: boolean;
  debounce: number;
}

const WATCH_FILES = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "nuxt.config.ts",
  "nuxt.config.js",
  "svelte.config.js",
  "astro.config.mjs",
  "webpack.config.js",
  "webpack.config.ts",
  "rollup.config.js",
  "rollup.config.ts",
  "tailwind.config.ts",
  "tailwind.config.js",
  "postcss.config.js",
  "postcss.config.ts",
  "Cargo.toml",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
  "vercel.json",
  "netlify.toml",
  "fly.toml",
  "prisma/schema.prisma",
  ".aware.json",
];

export async function watchCommand(options: WatchOptions): Promise<void> {
  const projectRoot = process.cwd();
  const debounceMs = options.debounce ?? 2000;

  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
  }

  log.header("Watching for project changes...");
  log.dim(`Debounce: ${debounceMs}ms | Auto-sync: ${options.autoSync ? "on" : "off"}`);
  log.dim("Press Ctrl+C to stop.\n");

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingChanges: Set<string> = new Set();
  let lastSyncTime: Date = config._meta.lastSyncedAt
    ? new Date(config._meta.lastSyncedAt)
    : new Date();
  let pendingCount = 0;
  let processing = false;

  // Status line updater
  const statusInterval = setInterval(() => {
    if (processing) return;
    const ago = timeSince(lastSyncTime);
    const status = `Watching... last sync ${ago}. ${pendingCount} change(s) pending.`;
    process.stdout.write(`\r\x1b[K${status}`);
  }, 1000);

  const clearStatus = () => {
    process.stdout.write("\r\x1b[K");
  };

  const processChanges = async () => {
    processing = true;
    clearStatus();

    const changes = [...pendingChanges];
    pendingChanges.clear();
    pendingCount = 0;

    const timestamp = new Date().toLocaleTimeString();
    const fileNames = changes
      .map((c) => path.relative(projectRoot, c))
      .join(", ");
    log.info(`[${timestamp}] Changed: ${fileNames}`);

    try {
      // Reload config in case .aware.json was edited
      const currentConfig = await loadConfig(projectRoot);
      if (!currentConfig) {
        log.warn("Could not read .aware.json");
        processing = false;
        return;
      }

      const stack = await detectStack(projectRoot);
      const newStackConfig = stackToConfig(stack);
      const newHash = computeDetectionHash(newStackConfig);

      const hasStackChanges = newHash !== currentConfig._meta.lastDetectionHash;
      const configFileChanged = changes.some((c) => c.endsWith(".aware.json"));

      if (!hasStackChanges && !configFileChanged) {
        log.dim("  No stack changes detected.");
        processing = false;
        return;
      }

      if (hasStackChanges) {
        log.info("  Stack changes detected:");
        for (const key of Object.keys(newStackConfig) as (keyof typeof newStackConfig)[]) {
          const oldVal = JSON.stringify(currentConfig.stack[key]);
          const newVal = JSON.stringify(newStackConfig[key]);
          if (oldVal !== newVal) {
            log.plain(`    ${key}: ${oldVal} -> ${newVal}`);
          }
        }
      } else if (configFileChanged) {
        log.info("  Config file changed -- regenerating...");
      }

      if (options.autoSync) {
        // Merge new detections into config (preserve user overrides for non-null existing values)
        for (const key of Object.keys(newStackConfig) as (keyof typeof newStackConfig)[]) {
          const current = currentConfig.stack[key];
          const detected = newStackConfig[key];
          if (
            current === null ||
            (Array.isArray(current) && current.length === 0)
          ) {
            (currentConfig.stack as unknown as Record<string, unknown>)[key] =
              detected;
          }
        }

        // Auto-sync
        const fragments = resolveFragments(stack, currentConfig);
        const results = generateAll(stack, currentConfig, fragments);

        for (const result of results) {
          await writeFile(
            path.join(projectRoot, result.filePath),
            result.content
          );
        }

        currentConfig._meta.lastSyncedAt = new Date().toISOString();
        currentConfig._meta.lastDetectionHash = newHash;
        await saveConfig(projectRoot, currentConfig);

        lastSyncTime = new Date();
        log.success(`  Synced ${results.length} file(s).`);
      } else {
        log.dim(
          "  Run `aware sync` to apply changes, or use --auto-sync."
        );
      }
    } catch (e) {
      log.error(
        `  Error processing changes: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    processing = false;
  };

  const onFileChange = (filePath: string) => {
    pendingChanges.add(filePath);
    pendingCount = pendingChanges.size;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void processChanges(), debounceMs);
  };

  // Set up watchers using Node.js fs.watch
  const watchers: fs.FSWatcher[] = [];

  for (const relPath of WATCH_FILES) {
    const absPath = path.join(projectRoot, relPath);

    // Watch the parent directory for files that may not exist yet
    const parentDir = path.dirname(absPath);
    const fileName = path.basename(absPath);

    // Only watch files that currently exist (fs.watch requires the target to exist)
    try {
      fs.accessSync(absPath, fs.constants.F_OK);
      const watcher = fs.watch(absPath, { persistent: true }, (eventType) => {
        if (eventType === "change" || eventType === "rename") {
          onFileChange(absPath);
        }
      });
      watcher.on("error", () => {
        // File may have been deleted; ignore
      });
      watchers.push(watcher);
    } catch {
      // File doesn't exist yet -- watch the parent directory for its creation
      try {
        fs.accessSync(parentDir, fs.constants.F_OK);
        const dirWatcher = fs.watch(
          parentDir,
          { persistent: true },
          (eventType, changedFile) => {
            if (changedFile === fileName) {
              onFileChange(absPath);
            }
          }
        );
        dirWatcher.on("error", () => {
          // Directory may have been removed; ignore
        });
        watchers.push(dirWatcher);
      } catch {
        // Parent directory doesn't exist either; skip
      }
    }
  }

  // Graceful shutdown
  const shutdown = () => {
    clearInterval(statusInterval);
    clearStatus();
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        // ignore
      }
    }
    log.plain("\nStopped watching.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
