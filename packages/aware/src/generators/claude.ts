import { TARGETS } from "../constants.js";
import type { ComposedContext, GeneratorResult, TargetName } from "../types.js";
import { BaseGenerator } from "./base.js";

export class ClaudeGenerator extends BaseGenerator {
  readonly target: TargetName = "claude";
  readonly filePath: string = TARGETS.claude.file;

  generate(context: ComposedContext): GeneratorResult {
    const blocks: string[] = [];

    if (context.projectSection) {
      blocks.push(this.wrapSection("project", context.projectSection));
    }
    if (context.stackSection) {
      blocks.push(this.wrapSection("stack", context.stackSection));
    }

    for (const fragment of context.fragmentSections) {
      if (fragment.content) {
        blocks.push(this.wrapSection(`fragment/${fragment.id}`, fragment.content));
      }
    }

    if (context.conventionsSection) {
      blocks.push(this.wrapSection("conventions", context.conventionsSection));
    }
    if (context.rulesSection) {
      blocks.push(this.wrapSection("rules", context.rulesSection));
    }
    if (context.structureSection) {
      blocks.push(this.wrapSection("structure", context.structureSection));
    }

    const body = blocks.join("\n\n");
    const content = this.finalize(body, false);

    return {
      target: this.target,
      filePath: this.filePath,
      content,
      sections: blocks.length,
    };
  }
}
