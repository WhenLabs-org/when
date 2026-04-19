import { stampHash } from "../core/hash.js";
import { footerWithPlaceholder, wrapSection } from "../core/markers.js";
import type { ComposedContext, GeneratorResult, TargetName } from "../types.js";

export abstract class BaseGenerator {
  abstract readonly target: TargetName;
  abstract readonly filePath: string;
  abstract generate(context: ComposedContext): GeneratorResult;

  /** Wrap a section body with open/close markers. */
  protected wrapSection(id: string, body: string): string {
    return wrapSection(id, body);
  }

  /**
   * Append the standard footer (with hash placeholder) and stamp the hash.
   * `trailingNewline` controls whether a final "\n" is appended after the
   * hash comment — useful for generators that previously ended with one.
   */
  protected finalize(body: string, trailingNewline = false): string {
    const withFooter = body + "\n\n" + footerWithPlaceholder();
    return stampHash(withFooter) + (trailingNewline ? "\n" : "");
  }
}
