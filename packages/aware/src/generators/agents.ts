import { TARGETS } from "../constants.js";
import type { ComposedContext, GeneratorResult, TargetName } from "../types.js";
import { BaseGenerator } from "./base.js";

export class AgentsGenerator extends BaseGenerator {
  readonly target: TargetName = "agents";
  readonly filePath: string = TARGETS.agents.file;

  generate(context: ComposedContext): GeneratorResult {
    const sections: string[] = [];
    sections.push("# AGENTS.md");

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
      sections.push(`## Context\n${contextParts.join("\n")}`);
    }

    // Tech Stack
    if (context.stackSection) {
      // Replace "## Tech Stack" heading with "## Tech Stack" (keep consistent)
      const stackBody = context.stackSection.replace(/^##\s*Tech Stack\n?/, "");
      sections.push(`## Tech Stack\n${stackBody}`);
    }

    // Conventions: combine fragments + conventions
    const conventionParts: string[] = [];
    for (const fragment of context.fragmentSections) {
      if (fragment.category === "testing") continue; // testing goes in its own section
      if (fragment.content) {
        conventionParts.push(`### ${fragment.title}\n${fragment.content}`);
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
      sections.push(`## Conventions\n${conventionParts.join("\n\n")}`);
    }

    // Constraints from rules
    if (context.rulesSection) {
      const rulesBody = context.rulesSection.replace(/^##\s*Rules\n?/, "");
      sections.push(`## Constraints\n${rulesBody}`);
    }

    // Testing: testing fragments only
    const testingParts: string[] = [];
    for (const fragment of context.fragmentSections) {
      if (fragment.category === "testing" && fragment.content) {
        testingParts.push(fragment.content);
      }
    }
    if (testingParts.length > 0) {
      sections.push(`## Testing\n${testingParts.join("\n\n")}`);
    }

    // Structure
    if (context.structureSection) {
      const structBody = context.structureSection.replace(
        /^##\s*Project Structure\n?/,
        "",
      );
      sections.push(`## Project Structure\n${structBody}`);
    }

    const content = sections.join("\n\n") + "\n";

    return {
      target: this.target,
      filePath: this.filePath,
      content,
      // Count sections minus the title heading
      sections: sections.length - 1,
    };
  }
}
