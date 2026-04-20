import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export interface WatcherOptions {
  /** Files (absolute paths) to watch. */
  paths: string[];
  /** Debounce in milliseconds. */
  debounceMs?: number;
  onChange: (changedPath: string) => void | Promise<void>;
  signal?: AbortSignal;
}

/**
 * Multi-file watcher with a debounce. Uses directory watchers so renames
 * within a dir (e.g. editor atomic writes) don't silently stop updates.
 */
export function startWatching(options: WatcherOptions): () => void {
  const debounce = options.debounceMs ?? 150;
  const absolute = options.paths.map((p) => resolve(p));
  const watchedDirs = new Map<string, FSWatcher>();
  // basename() handles both POSIX `/` and Windows `\` separators — the
  // previous slice on `/` left Windows paths un-basenamed so no events fired.
  const targetBasenames = new Set(absolute.map((p) => basename(p)));

  let timer: NodeJS.Timeout | undefined;
  let pendingPath: string | undefined;

  const fire = () => {
    const path = pendingPath;
    pendingPath = undefined;
    if (path) void options.onChange(path);
  };

  const handler = (dir: string) => (_event: unknown, filename: unknown) => {
    const name = typeof filename === "string" ? filename : undefined;
    if (!name || !targetBasenames.has(name)) return;
    pendingPath = resolve(dir, name);
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, debounce);
  };

  for (const path of absolute) {
    const dir = dirname(path);
    if (watchedDirs.has(dir)) continue;
    try {
      watchedDirs.set(dir, watch(dir, handler(dir)));
    } catch {
      /* directory may not exist yet; ignore */
    }
  }

  const stop = () => {
    if (timer) clearTimeout(timer);
    for (const w of watchedDirs.values()) w.close();
    watchedDirs.clear();
  };

  if (options.signal) {
    if (options.signal.aborted) stop();
    else options.signal.addEventListener("abort", stop, { once: true });
  }

  return stop;
}
