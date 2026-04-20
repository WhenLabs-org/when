import { loadConfig, saveConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";
import { prompt } from "../utils/prompts.js";

interface AddOptions {
  type: string;
  rule?: string;
  dir?: string;
  description?: string;
  category?: string;
  key?: string;
  value?: string;
}

// Resolve a field non-interactively when a flag is supplied, otherwise prompt
// the user — but only if stdin is a TTY. In MCP / CI contexts there is no TTY
// and readline.question() would hang forever, so we surface a clear error
// instead telling the caller exactly which flag to set.
async function resolveField(
  flagValue: string | undefined,
  flagName: string,
  promptLabel: string,
): Promise<string> {
  if (flagValue && flagValue.trim()) return flagValue.trim();
  if (!process.stdin.isTTY) {
    log.error(
      `${promptLabel} is required. Pass --${flagName} <value> when running non-interactively (MCP / CI).`,
    );
    process.exit(2);
  }
  const answer = await prompt(promptLabel);
  return answer;
}

export async function addCommand(options: AddOptions): Promise<void> {
  const projectRoot = process.cwd();

  const config = await loadConfig(projectRoot);
  if (!config) {
    log.error("No .aware.json found. Run `aware init` first.");
    process.exit(1);
  }

  const type = options.type;

  switch (type) {
    case "rule": {
      const rule = await resolveField(options.rule, "rule", "Enter rule");
      if (!rule) {
        log.error("Rule cannot be empty.");
        return;
      }
      config.rules.push(rule);
      await saveConfig(projectRoot, config);
      log.success(`Rule added (${config.rules.length} total)`);
      break;
    }

    case "structure": {
      const dirPath = await resolveField(options.dir, "dir", "Directory path (e.g., src/utils/)");
      if (!dirPath) {
        log.error("Path cannot be empty.");
        return;
      }
      const description = await resolveField(options.description, "description", "Description");
      if (!description) {
        log.error("Description cannot be empty.");
        return;
      }
      config.structure[dirPath] = description;
      await saveConfig(projectRoot, config);
      log.success(`Structure entry added: ${dirPath}`);
      break;
    }

    case "convention": {
      const category = await resolveField(options.category, "category", "Category (e.g., naming, imports, testing)");
      if (!category) {
        log.error("Category cannot be empty.");
        return;
      }
      const key = await resolveField(options.key, "key", "Key (e.g., files, functions, components)");
      if (!key) {
        log.error("Key cannot be empty.");
        return;
      }
      const value = await resolveField(options.value, "value", "Value");
      if (!value) {
        log.error("Value cannot be empty.");
        return;
      }
      if (!config.conventions[category]) {
        config.conventions[category] = {};
      }
      (config.conventions[category] as Record<string, string>)[key] = value;
      await saveConfig(projectRoot, config);
      log.success(`Convention added: ${category}.${key}`);
      break;
    }

    default:
      log.error(`Unknown type: ${type}. Use: rule, structure, convention`);
      process.exit(1);
  }

  log.dim("Run `aware sync` to regenerate context files with the new changes.");
}
