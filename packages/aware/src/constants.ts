export const VERSION = "0.1.0";
export const CONFIG_FILE = ".aware.json";
export const SCHEMA_VERSION = 2;

export const TARGETS = {
  claude: { file: "CLAUDE.md", name: "Claude Code" },
  cursor: { file: ".cursorrules", name: "Cursor" },
  copilot: { file: ".github/copilot-instructions.md", name: "GitHub Copilot" },
  agents: { file: "AGENTS.md", name: "AGENTS.md" },
} as const;

// ---- Section marker protocol ----
// HTML comments wrap each top-level section of generated output so that
// Phase 1's diff engine can attribute hand-edits to a specific section.
// A section marked `custom` is preserved verbatim on sync.
export const SECTION_MARKER_PREFIX = "aware:section:";
export const SECTION_CUSTOM_TOKEN = "custom";
export const HASH_MARKER_PREFIX = "aware:hash:";
export const HASH_PLACEHOLDER = "__AWARE_HASH_PLACEHOLDER__";
