import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { computeDriftReport } from "../../src/diff/drift-report.js";
import { createDefaultConfig, saveConfig } from "../../src/utils/config.js";
import { scan } from "../../src/scan.js";
import type { StackConfig, TargetsConfig } from "../../src/types.js";

const defaultStack: StackConfig = {
  framework: "nextjs@15.1:app-router",
  language: "typescript@5.5",
  styling: null,
  orm: null,
  database: null,
  testing: [],
  linting: [],
  packageManager: "pnpm",
  monorepo: null,
  deployment: null,
  auth: null,
  apiStyle: null,
};

const targets: TargetsConfig = {
  claude: true,
  cursor: false,
  copilot: false,
  agents: false,
};

describe("computeDriftReport end-to-end", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-drift-e2e-"));
    // Minimal package.json so detection finds something plausible.
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "drift-e2e",
        dependencies: { next: "^15.1.0", react: "^19.0.0" },
      }),
    );
  });

  it("reports severity=none when config, stack, and files are all aligned", async () => {
    const result = await scan({ projectRoot: tmp, targets, detect: true });
    await saveConfig(tmp, result.config);
    for (const file of result.generatedFiles) {
      await fs.writeFile(path.join(tmp, file.path), file.content);
    }

    const report = await computeDriftReport({
      projectRoot: tmp,
      config: result.config,
    });
    expect(report.severity).toBe("none");
    expect(report.stackDrifts).toEqual([]);
    expect(report.contentDrifts).toEqual([]);
  });

  it("reports severity=warn when a generated file is missing", async () => {
    const result = await scan({ projectRoot: tmp, targets, detect: true });
    await saveConfig(tmp, result.config);
    // Deliberately do NOT write CLAUDE.md to disk.

    const report = await computeDriftReport({
      projectRoot: tmp,
      config: result.config,
    });
    expect(report.severity).toBe("warn");
    expect(report.contentDrifts[0]!.kind).toBe("missing");
  });

  it("reports severity=tamper when a generated file was hand-edited", async () => {
    const result = await scan({ projectRoot: tmp, targets, detect: true });
    await saveConfig(tmp, result.config);
    const filePath = path.join(tmp, "CLAUDE.md");
    for (const file of result.generatedFiles) {
      await fs.writeFile(path.join(tmp, file.path), file.content);
    }
    const original = await fs.readFile(filePath, "utf8");
    // Replace a substring that's guaranteed to exist regardless of which
    // Next.js variant the detector picks (App vs Pages router).
    const edited = original.replace("Tech Stack", "TECH STACK");
    expect(edited).not.toBe(original); // sanity: replacement happened
    await fs.writeFile(filePath, edited);

    const report = await computeDriftReport({
      projectRoot: tmp,
      config: result.config,
    });
    expect(report.severity).toBe("tamper");
    expect(report.hasTamper).toBe(true);
    expect(report.contentDrifts[0]!.kind).toBe("tampered");
  });

  it("reports severity=warn (not tamper) for stack drift alone", async () => {
    // Seed a config whose framework doesn't match what detect() will find
    // (package.json pins next@15; config claims next@14). Sync the files
    // using the *saved* config so they're internally consistent and will
    // verify cleanly — the only drift the engine should report is the
    // stack discrepancy.
    const staleConfig = createDefaultConfig(
      "drift-e2e",
      { ...defaultStack, framework: "nextjs@14:app-router" },
      targets,
    );
    await saveConfig(tmp, staleConfig);
    const stale = await scan({ projectRoot: tmp, targets, detect: false });
    for (const file of stale.generatedFiles) {
      await fs.writeFile(path.join(tmp, file.path), file.content);
    }

    const report = await computeDriftReport({
      projectRoot: tmp,
      config: staleConfig,
    });
    // Explicit expectations about the composition of the verdict:
    //   - there IS stack drift (saved "14" vs detected "15")
    //   - there is NO tampering (files self-verify)
    //   - severity is "warn", not "tamper"
    expect(report.hasStackDrift).toBe(true);
    expect(report.hasTamper).toBe(false);
    expect(report.severity).toBe("warn");
    expect(report.stackDrifts.some((d) => d.key === "framework")).toBe(true);
  });

  it("reports severity=warn for a disabled target whose file is still present", async () => {
    // First sync with claude enabled so we get a valid CLAUDE.md on disk.
    const result = await scan({ projectRoot: tmp, targets, detect: true });
    await saveConfig(tmp, result.config);
    for (const file of result.generatedFiles) {
      await fs.writeFile(path.join(tmp, file.path), file.content);
    }

    // Now disable claude in the config without deleting the file —
    // common scenario when someone reconfigures their targets.
    result.config.targets.claude = false;
    const report = await computeDriftReport({
      projectRoot: tmp,
      config: result.config,
    });
    expect(report.severity).toBe("warn");
    expect(report.contentDrifts.some((d) => d.kind === "stale")).toBe(true);
  });

  it("Phase-2 fragment.version doesn't cause spurious drift on Phase-1 configs", async () => {
    // Simulate a project synced before Phase 2 introduced per-module
    // version tags: scan normally, blank out fragmentVersions to mimic
    // the v1-era state, write files, then run the drift engine.
    const result = await scan({ projectRoot: tmp, targets, detect: true });
    result.config._meta.fragmentVersions = {};
    await saveConfig(tmp, result.config);
    for (const file of result.generatedFiles) {
      await fs.writeFile(path.join(tmp, file.path), file.content);
    }

    const report = await computeDriftReport({
      projectRoot: tmp,
      config: result.config,
    });
    // The drift engine reads embedded hashes from files, not from
    // fragmentVersions — an empty map must not register drift.
    expect(report.severity).toBe("none");
  });

  it("restricts content drift to --target when specified", async () => {
    const allTargets: TargetsConfig = {
      claude: true,
      cursor: true,
      copilot: false,
      agents: false,
    };
    const result = await scan({
      projectRoot: tmp,
      targets: allTargets,
      detect: true,
    });
    await saveConfig(tmp, result.config);
    // Neither file on disk → missing for both. With --target=claude, only
    // CLAUDE.md should show up.
    const report = await computeDriftReport({
      projectRoot: tmp,
      config: result.config,
      target: "claude",
    });
    expect(report.contentDrifts.every((d) => d.target === "claude")).toBe(true);
  });
});
