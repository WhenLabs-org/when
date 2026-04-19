export interface CargoLockPackage {
  name: string;
  version: string;
  source?: string;
  dependencies: string[];
}

/**
 * Minimal parser for Cargo.lock (TOML subset). Cargo.lock has a fixed,
 * auto-generated shape so we don't need a full TOML library:
 *   - comments starting with `#`
 *   - top-level key/value pairs (we ignore everything except `[[package]]` tables)
 *   - `[[package]]` headers
 *   - quoted-string values: `name = "serde"`, `version = "1.0.0"`
 *   - array-of-strings values: `dependencies = [ "a", "b 1.2.3 (registry+...)" ]`
 *
 * Dependency entries can take the forms:
 *   "name"                    — unique within the lockfile, resolves by name
 *   "name version"            — disambiguates when two versions exist
 *   "name version (source)"   — with source (rare now; cargo dedups)
 * We keep the raw strings; consumers can resolve them against the package list.
 */
export function parseCargoLock(content: string): CargoLockPackage[] {
  const packages: CargoLockPackage[] = [];
  let current: {
    name?: string;
    version?: string;
    source?: string;
    dependencies: string[];
  } | null = null;
  let inDependencyArray = false;

  const flush = () => {
    if (current && current.name && current.version) {
      packages.push({
        name: current.name,
        version: current.version,
        source: current.source,
        dependencies: current.dependencies,
      });
    }
  };

  const lines = content.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (inDependencyArray) {
      if (line === ']') {
        inDependencyArray = false;
        continue;
      }
      const m = line.match(/^"([^"]+)"\s*,?$/);
      if (m && current) current.dependencies.push(m[1]!);
      continue;
    }

    if (line === '[[package]]') {
      flush();
      current = { dependencies: [] };
      continue;
    }

    if (!current) continue;

    // Single-line array: dependencies = ["a", "b"]
    const inlineArr = line.match(/^(\w+)\s*=\s*\[(.*)\]\s*$/);
    if (inlineArr) {
      const [, key, body] = inlineArr;
      if (key === 'dependencies') {
        current.dependencies = [...body!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
      }
      continue;
    }

    // Multi-line array start: dependencies = [
    const arrStart = line.match(/^(\w+)\s*=\s*\[\s*$/);
    if (arrStart) {
      if (arrStart[1] === 'dependencies') {
        inDependencyArray = true;
      }
      continue;
    }

    // Key = "value"
    const kv = line.match(/^(\w+)\s*=\s*"(.*)"\s*$/);
    if (kv) {
      const [, key, value] = kv;
      if (key === 'name') current.name = value;
      else if (key === 'version') current.version = value;
      else if (key === 'source') current.source = value;
    }
  }

  flush();
  return packages;
}

/**
 * A Cargo.lock dependency entry is like "name", "name version", or
 * "name version (source)". Extract just the package name for lookup.
 */
export function parseDependencyName(entry: string): string {
  const spaceIdx = entry.indexOf(' ');
  return spaceIdx === -1 ? entry : entry.slice(0, spaceIdx);
}
