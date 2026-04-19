export interface PoetryLockPackage {
  name: string;
  version: string;
  optional: boolean;
  category?: string;
  /** Names of direct dependencies captured from [package.dependencies] subtables. */
  dependencies: string[];
}

/**
 * Minimal parser for poetry.lock (TOML subset). Tracks just enough state to
 * pull out name/version/optional/category plus the list of direct dependency
 * names from [package.dependencies] subtables. Avoids pulling in a full TOML
 * library — poetry.lock is auto-generated and has a tight grammar.
 *
 * Recognized subtable shapes for dependencies:
 *   [package.dependencies]
 *   charset-normalizer = ">=2,<4"
 *   urllib3 = {version = ">=1.21.1,<3", optional = true}
 *
 *   [package.dependencies.certifi]
 *   version = ">=2017.4.17"
 *   python-versions = ">=3.7"
 *
 * Any bracketed section other than [[package]] / [package.dependencies] /
 * [package.dependencies.NAME] (e.g. [package.extras], [metadata],
 * [metadata.files]) is treated as an ignored "nested" subtable — we
 * skip its field lines entirely.
 */
type ParseState = 'top' | 'deps' | 'nested';

export function parsePoetryLock(content: string): PoetryLockPackage[] {
  const packages: PoetryLockPackage[] = [];
  let current: {
    name?: string;
    version?: string;
    optional?: boolean;
    category?: string;
    dependencies: string[];
  } | null = null;
  let state: ParseState = 'top';

  const flush = (): void => {
    if (current && current.name && current.version) {
      packages.push({
        name: current.name,
        version: current.version,
        optional: current.optional ?? false,
        category: current.category,
        dependencies: [...new Set(current.dependencies)],
      });
    }
  };

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (line === '[[package]]') {
      flush();
      current = { dependencies: [] };
      state = 'top';
      continue;
    }

    // Other array-of-tables headers (e.g. [[metadata.files]]).
    if (/^\[\[.+\]\]$/.test(line)) {
      state = 'nested';
      continue;
    }

    // Single-bracket table header.
    const tableMatch = line.match(/^\[([^\[\]]+)\]$/);
    if (tableMatch) {
      const tableName = tableMatch[1]!;
      if (tableName === 'package.dependencies') {
        state = 'deps';
      } else if (tableName.startsWith('package.dependencies.')) {
        const depName = tableName.slice('package.dependencies.'.length);
        if (current) current.dependencies.push(depName);
        state = 'nested';
      } else {
        state = 'nested';
      }
      continue;
    }

    if (!current || state === 'nested') continue;

    if (state === 'deps') {
      // Each `key = ...` line under [package.dependencies] names a dep.
      // Key form tolerates hyphens, underscores, dots, and digits.
      const keyMatch = line.match(/^([A-Za-z0-9][\w.-]*)\s*=/);
      if (keyMatch) current.dependencies.push(keyMatch[1]!);
      continue;
    }

    // state === 'top': pull [[package]] scalar fields.
    const str = line.match(/^(\w[\w-]*)\s*=\s*"(.*)"\s*$/);
    if (str) {
      const [, key, value] = str;
      if (key === 'name') current.name = value;
      else if (key === 'version') current.version = value;
      else if (key === 'category') current.category = value;
      continue;
    }

    const bare = line.match(/^(\w[\w-]*)\s*=\s*(\w+)\s*$/);
    if (bare) {
      const [, key, value] = bare;
      if (key === 'optional') current.optional = value === 'true';
    }
  }

  flush();
  return packages;
}
