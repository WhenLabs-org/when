import * as path from "node:path";
import { watch as chokidarWatch } from "chokidar";
import { detectStack, stackToConfig } from "../detectors/index.js";
import { resolveFragments } from "../fragments/index.js";
import { generateAll } from "../generators/index.js";
import { loadConfig, saveConfig, computeDetectionHash } from "../utils/config.js";
import { writeFile } from "../utils/fs.js";
import { log } from "../utils/logger.js";

interface WatchOptions {
  autoSync: boolean;
}

export async function watchCommand(options: WatchOptions): Promise<void> {
  const projectRoot = process.cwd();

  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
  }

  const watchPaths = [
    "package.json",
    "tsconfig.json",
    "Cargo.toml",
    "requirements.txt",
    "pyproject.toml",
    "go.mod",
    "*.config.ts",
    "*.config.js",
    "*.config.mjs",
    "*.config.cjs",
    ".env",
    ".env.local",
    "docker-compose.yml",
    "docker-compose.yaml",
    "vercel.json",
    "netlify.toml",
    "fly.toml",
    "prisma/schema.prisma",
    ".aware.json",
  ].map((p) => path.join(projectRoot, p));

  log.header("Watching for project changes...");
  log.dim("Press Ctrl+C to stop.\n");

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingChanges: Set<string> = new Set();

  const watcher = chokidarWatch(watchPaths, {
    ignoreInitial: true,
    ignored: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
    ],
  });

  const processChanges = async () => {
    const changes = [...pendingChanges];
    pendingChanges.clear();

    const timestamp = new Date().toLocaleTimeString();
    const fileNames = changes.map((c) => path.relative(projectRoot, c)).join(", ");
    log.info(`[${timestamp}] Changed: ${fileNames}`);

    try {
      // Reload config in case .aware.json was edited
      const currentConfig = await loadConfig(projectRoot);
      if (!currentConfig) {
        log.warn("Could not read .aware.json");
        return;
      }

      const stack = await detectStack(projectRoot);
      const newStackConfig = stackToConfig(stack);
      const newHash = computeDetectionHash(newStackConfig);

      if (newHash === currentConfig._meta.lastDetectionHash) {
        log.dim(`  No stack changes detected.`);

        // If .aware.json itself changed, still sync
        if (changes.some((c) => c.endsWith(".aware.json"))) {
          log.info("  Config file changed — regenerating...");
        } else {
          return;
        }
      } else {
        log.info("  Stack changes detected:");
        for (const key of Object.keys(newStackConfig) as (keyof typeof newStackConfig)[]) {
          const oldVal = JSON.stringify(currentConfig.stack[key]);
          const newVal = JSON.stringify(newStackConfig[key]);
          if (oldVal !== newVal) {
            log.plain(`    ${key}: ${oldVal} → ${newVal}`);
          }
        }
      }

      if (options.autoSync) {
        // Auto-sync
        const fragments = resolveFragments(stack, currentConfig);
        const results = generateAll(stack, currentConfig, fragments);

        for (const result of results) {
          await writeFile(path.join(projectRoot, result.filePath), result.content);
        }

        currentConfig._meta.lastSyncedAt = new Date().toISOString();
        currentConfig._meta.lastDetectionHash = newHash;
        await saveConfig(projectRoot, currentConfig);

        log.success(`  Synced ${results.length} file(s).`);
      } else {
        log.dim("  Run `aware sync` to apply changes, or use --auto-sync.");
      }
    } catch (e) {
      log.error(`  Error processing changes: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  watcher.on("change", (filePath) => {
    pendingChanges.add(filePath);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void processChanges(), 500);
  });

  watcher.on("add", (filePath) => {
    pendingChanges.add(filePath);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void processChanges(), 500);
  });

  // Graceful shutdown
  const shutdown = () => {
    log.plain("\nStopped watching.");
    void watcher.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
