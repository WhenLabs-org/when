import type {
  AwareConfig,
  DetectedStack,
  Fragment,
  GeneratorResult,
  TargetName,
  TargetsConfig,
} from "../types.js";
import { AgentsGenerator } from "./agents.js";
import { BaseGenerator } from "./base.js";
import { ClaudeGenerator } from "./claude.js";
import { composeContext } from "./composer.js";
import { CopilotGenerator } from "./copilot.js";
import { CursorGenerator } from "./cursor.js";

const ALL_GENERATORS: BaseGenerator[] = [
  new ClaudeGenerator(),
  new CursorGenerator(),
  new CopilotGenerator(),
  new AgentsGenerator(),
];

/**
 * Return only generators whose target is enabled in the config.
 */
export function getEnabledGenerators(targets: TargetsConfig): BaseGenerator[] {
  return ALL_GENERATORS.filter((g) => targets[g.target] === true);
}

/**
 * Compose context from stack/config/fragments, then run every enabled generator.
 */
export function generateAll(
  stack: DetectedStack,
  config: AwareConfig,
  fragments: Fragment[],
): GeneratorResult[] {
  const context = composeContext(stack, config, fragments);
  const generators = getEnabledGenerators(config.targets);
  return generators.map((g) => g.generate(context));
}

export { BaseGenerator } from "./base.js";
export { ClaudeGenerator } from "./claude.js";
export { composeContext } from "./composer.js";
export { CopilotGenerator } from "./copilot.js";
export { CursorGenerator } from "./cursor.js";
export { AgentsGenerator } from "./agents.js";
