import * as path from "node:path";
import type {
  Finding,
  ScanOptions as CoreScanOptions,
  ScanResult as CoreScanResult,
  Tool,
} from "@whenlabs/core";
import { schemaVersion } from "@whenlabs/core";
import { scan, type ScanOutput, type GeneratedFile } from "./scan.js";
import { readFile } from "./utils/fs.js";
import type { DetectedStack } from "./types.js";

const TOOL_NAME = "aware";

// Phase 2 red flag (carried forward for integration): aware's DetectedStack
// is loose — there is no single canonical shape, just a big union of per-
// category StackItem objects. We deliberately do NOT try to tighten this in
// the port. The Finding[] surfaces only actionable deltas (missing or stale
// AI-context files). The full detection payload — stack, fragments,
// generated file contents — is stashed in ScanResult.raw so downstream
// consumers can render the detected-stack table and file previews without
// re-running detection.

interface AwareRaw {
  stack: DetectedStack;
  projectName: string;
  fragments: ScanOutput["fragments"];
  generatedFiles: GeneratedFile[];
}

async function fileToFinding(
  projectRoot: string,
  file: GeneratedFile,
): Promise<Finding | null> {
  const absPath = path.join(projectRoot, file.path);
  const current = await readFile(absPath);

  if (current === null) {
    return {
      tool: TOOL_NAME,
      ruleId: "missing-ai-context-file",
      severity: "warning",
      message: `${file.path} is missing — run \`aware init\` to generate it`,
      suggestion: `Create ${file.path} with ${file.sections} sections for target ${file.target}`,
      location: { file: file.path },
      data: {
        target: file.target,
        sections: file.sections,
        expectedPath: file.path,
        expectedContent: file.content,
      },
    };
  }

  if (current !== file.content) {
    return {
      tool: TOOL_NAME,
      ruleId: "stale-ai-context-file",
      severity: "warning",
      message: `${file.path} is out of date with detected stack — run \`aware sync\``,
      suggestion: `Regenerate ${file.path} to match the current stack`,
      location: { file: file.path },
      data: {
        target: file.target,
        sections: file.sections,
        expectedPath: file.path,
        expectedContent: file.content,
      },
    };
  }

  return null;
}

function stackHints(stack: DetectedStack): string[] {
  const hints: string[] = [];
  if (stack.language?.name) hints.push(stack.language.name);
  if (stack.framework?.name) hints.push(stack.framework.name);
  if (stack.packageManager?.name) hints.push(stack.packageManager.name);
  return hints;
}

export function createTool(): Tool {
  return {
    name: TOOL_NAME,
    description:
      "Auto-detect your stack and keep AI context files (CLAUDE.md, .cursorrules, AGENTS.md, copilot-instructions.md) in sync",
    async scan(opts?: CoreScanOptions): Promise<CoreScanResult> {
      const startedAt = new Date();
      const cwd = opts?.cwd ?? process.cwd();

      const result = await scan({ projectRoot: cwd });

      const findings: Finding[] = [];
      for (const file of result.generatedFiles) {
        const finding = await fileToFinding(cwd, file);
        if (finding) findings.push(finding);
      }

      const errors = findings.filter((f) => f.severity === "error").length;
      const warnings = findings.filter((f) => f.severity === "warning").length;
      const infos = findings.filter((f) => f.severity === "info").length;

      const raw: AwareRaw = {
        stack: result.stack,
        projectName: result.projectName,
        fragments: result.fragments,
        generatedFiles: result.generatedFiles,
      };

      return {
        schemaVersion,
        tool: TOOL_NAME,
        ok: errors === 0,
        project: {
          name: result.projectName,
          cwd: result.projectRoot,
          detectedStack: stackHints(result.stack),
        },
        findings,
        summary: {
          total: findings.length,
          errors,
          warnings,
          infos,
          extra: {
            generatedFiles: result.generatedFiles.length,
            fragments: result.fragments.length,
            missingFiles: findings.filter((f) => f.ruleId === "missing-ai-context-file").length,
            staleFiles: findings.filter((f) => f.ruleId === "stale-ai-context-file").length,
          },
        },
        timing: {
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
        },
        raw,
      };
    },
  };
}
