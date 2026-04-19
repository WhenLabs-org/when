import { TARGETS } from "../constants.js";
import type { ComposedContext, GeneratorResult, TargetName } from "../types.js";
import { BaseGenerator } from "./base.js";

export class AgentsGenerator extends BaseGenerator {
  readonly target: TargetName = "agents";
  readonly filePath: string = TARGETS.agents.file;

  generate(context: ComposedContext): GeneratorResult {
    const blocks: string[] = [];
    blocks.push("# AGENTS.md");

    // Context section: project description + architecture
    const contextParts: string[] = [];
    if (context.projectSection) {
      // Strip the "# Project: ..." heading, keep description and architecture
      const lines = context.projectSection.split("\n");
      for (const line of lines) {
        if (line.startsWith("# Project:")) continue;
        if (line.trim()) contextParts.push(line);
      }
    }
    if (contextParts.length > 0) {
      blocks.push(
        this.wrapSection("context", `## Context\n${contextParts.join("\n")}`),
      );
    }

    // Tech Stack
    if (context.stackSection) {
      const stackBody = context.stackSection.replace(/^##\s*Tech Stack\n?/, "");
      blocks.push(this.wrapSection("stack", `## Tech Stack\n${stackBody}`));
    }

    // Conventions: combine fragments + conventions
    const conventionParts: string[] = [];
    for (const fragment of context.fragmentSections) {
      if (fragment.category === "testing") continue; // testing goes in its own section
      if (fragment.content) {
        // Fragment content already includes its own ## heading — strip it and use ### for nesting
        const fragmentBody = fragment.content.replace(/^##\s+.+\n?/, "");
        conventionParts.push(`### ${fragment.title}\n${fragmentBody}`);
      }
    }
    if (context.conventionsSection) {
      // Strip the top-level "## Conventions" heading since we provide our own
      const body = context.conventionsSection.replace(
        /^##\s*Conventions\n?/,
        "",
      );
      if (body.trim()) {
        conventionParts.push(body);
      }
    }
    if (conventionParts.length > 0) {
      blocks.push(
        this.wrapSection(
          "conventions",
          `## Conventions\n${conventionParts.join("\n\n")}`,
        ),
      );
    }

    // Constraints from rules
    if (context.rulesSection) {
      const rulesBody = context.rulesSection.replace(/^##\s*Rules\n?/, "");
      blocks.push(
        this.wrapSection("constraints", `## Constraints\n${rulesBody}`),
      );
    }

    // Testing: testing fragments only
    const testingParts: string[] = [];
    for (const fragment of context.fragmentSections) {
      if (fragment.category === "testing" && fragment.content) {
        testingParts.push(fragment.content);
      }
    }
    if (testingParts.length > 0) {
      blocks.push(
        this.wrapSection("testing", `## Testing\n${testingParts.join("\n\n")}`),
      );
    }

    // Structure
    if (context.structureSection) {
      const structBody = context.structureSection.replace(
        /^##\s*Project Structure\n?/,
        "",
      );
      blocks.push(
        this.wrapSection("structure", `## Project Structure\n${structBody}`),
      );
    }

    const body = blocks.join("\n\n");
    const content = this.finalize(body, true);

    return {
      target: this.target,
      filePath: this.filePath,
      content,
      // Count sections minus the title heading
      sections: blocks.length - 1,
    };
  }
}
