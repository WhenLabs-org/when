export const VERSION = "0.1.0";
export const CONFIG_FILE = ".contextpilot.json";
export const SCHEMA_VERSION = 1;

export const TARGETS = {
  claude: { file: "CLAUDE.md", name: "Claude Code" },
  cursor: { file: ".cursorrules", name: "Cursor" },
  copilot: { file: ".github/copilot-instructions.md", name: "GitHub Copilot" },
  agents: { file: "AGENTS.md", name: "AGENTS.md" },
} as const;
