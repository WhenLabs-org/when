import type { Reporter } from "../schema/types.js";
import { TerminalReporter } from "./terminal.js";
import { JsonReporter } from "./json.js";
import { MarkdownReporter } from "./markdown.js";

export type ReporterFormat = "terminal" | "json" | "markdown";

export function createReporter(format: ReporterFormat): Reporter {
  switch (format) {
    case "terminal":
      return new TerminalReporter();
    case "json":
      return new JsonReporter();
    case "markdown":
      return new MarkdownReporter();
  }
}
