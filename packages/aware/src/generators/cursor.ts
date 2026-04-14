import { TARGETS } from "../constants.js";
import type {
  ComposedContext,
  Fragment,
  GeneratorResult,
  TargetName,
} from "../types.js";
import { BaseGenerator } from "./base.js";

const IMPERATIVE_PATTERNS = /\b(use|avoid|never|always|prefer|do not|ensure)\b/i;

/**
 * Extract imperative rule lines from fragment content.
 * Picks lines starting with "- " that contain action keywords, up to `max` lines.
 */
export function condenseFragment(fragment: Fragment): string[] {
  if (!fragment.content) return [];

  const lines = fragment.content.split("\n");
  const rules: string[] = [];

  for (const line of lines) {
    if (rules.length >= 4) break;
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") && IMPERATIVE_PATTERNS.test(trimmed)) {
      // Strip the leading "- " so we can re-add it in the final output
      rules.push(trimmed.slice(2));
    }
  }

  return rules;
}

function extractStackList(stackSection: string): string {
  if (!stackSection) return "";
  // Parse bullet lines like "- **Framework**: Next.js 15.1 (App Router)"
  const items: string[] = [];
  for (const line of stackSection.split("\n")) {
    const match = line.match(/^\- \*\*[^*]+\*\*:\s*(.+)$/);
    if (match?.[1]) {
      items.push(match[1]);
    }
  }
  return items.join(", ");
}

function extractConventionRules(conventionsSection: string): string[] {
  if (!conventionsSection) return [];
  const rules: string[] = [];
  for (const line of conventionsSection.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      // Convert "- **key**: value" to "key: value" or keep as-is
      const cleaned = trimmed
        .slice(2)
        .replace(/\*\*/g, "");
      rules.push(cleaned);
    }
  }
  return rules;
}

function extractRules(rulesSection: string): string[] {
  if (!rulesSection) return [];
  const rules: string[] = [];
  for (const line of rulesSection.split("\n")) {
    const match = line.match(/^\d+\.\s+(.+)$/);
    if (match?.[1]) {
      rules.push(match[1]);
    }
  }
  return rules;
}

function extractStructure(structureSection: string): string[] {
  if (!structureSection) return [];
  const lines: string[] = [];
  for (const line of structureSection.split("\n")) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|$/);
    if (match) {
      lines.push(`${match[1]} — ${match[2]}`);
    }
  }
  return lines;
}

export class CursorGenerator extends BaseGenerator {
  readonly target: TargetName = "cursor";
  readonly filePath: string = TARGETS.cursor.file;

  generate(context: ComposedContext): GeneratorResult {
    const parts: string[] = [];
    let sectionCount = 0;

    // Header
    const projectLines = context.projectSection.split("\n").filter(Boolean);
    const name = projectLines[0]?.replace(/^#\s*Project:\s*/, "") ?? "this project";
    const description = projectLines.length > 1 ? projectLines[1] : "";
    if (name || description) {
      const intro = description
        ? `You are working on ${name}, ${description.toLowerCase().replace(/\.$/, "")}.`
        : `You are working on ${name}.`;
      parts.push(intro);
      sectionCount++;
    }

    // Tech stack
    const stackList = extractStackList(context.stackSection);
    if (stackList) {
      parts.push(`Tech stack: ${stackList}`);
      sectionCount++;
    }

    // Rules
    const allRules: string[] = [];
    allRules.push(...extractRules(context.rulesSection));
    for (const fragment of context.fragmentSections) {
      allRules.push(...condenseFragment(fragment));
    }
    allRules.push(...extractConventionRules(context.conventionsSection));

    if (allRules.length > 0) {
      parts.push(`Rules:\n${allRules.map((r) => `- ${r}`).join("\n")}`);
      sectionCount++;
    }

    // Structure
    const structureLines = extractStructure(context.structureSection);
    if (structureLines.length > 0) {
      parts.push(
        `Project structure:\n${structureLines.map((l) => `- ${l}`).join("\n")}`,
      );
      sectionCount++;
    }

    const content = parts.join("\n\n") + "\n";

    return {
      target: this.target,
      filePath: this.filePath,
      content,
      sections: sectionCount,
    };
  }
}
