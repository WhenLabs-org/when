import { TARGETS } from "../constants.js";
import type { ComposedContext, GeneratorResult, TargetName } from "../types.js";
import { BaseGenerator } from "./base.js";

/**
 * Trim markdown content to the first `maxLines` bullet points / lines.
 * Non-bullet lines (headings, blank) pass through freely; only "- " lines are counted.
 * After the bullet cap, any ### subsection heading whose body was fully trimmed
 * (no bullets remain under it before the next heading or EOF) is also dropped,
 * so the output doesn't end up with naked headings followed by empty space.
 */
export function trimFragment(content: string, maxLines: number): string {
  if (!content) return "";

  const lines = content.split("\n");
  const capped: string[] = [];
  let bulletCount = 0;

  for (const line of lines) {
    const isBullet = line.trimStart().startsWith("- ");
    if (isBullet) {
      if (bulletCount >= maxLines) continue;
      bulletCount++;
    }
    capped.push(line);
  }

  const result: string[] = [];
  for (let i = 0; i < capped.length; i++) {
    const line = capped[i];
    if (line.startsWith("### ")) {
      let hasBullet = false;
      for (let j = i + 1; j < capped.length; j++) {
        const next = capped[j];
        if (next.startsWith("## ") || next.startsWith("### ")) break;
        if (next.trimStart().startsWith("- ")) {
          hasBullet = true;
          break;
        }
      }
      if (!hasBullet) continue;
    }
    result.push(line);
  }

  return result.join("\n");
}

export class CopilotGenerator extends BaseGenerator {
  readonly target: TargetName = "copilot";
  readonly filePath: string = TARGETS.copilot.file;

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
        const trimmed = trimFragment(fragment.content, 5);
        blocks.push(this.wrapSection(`fragment/${fragment.id}`, trimmed));
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
