import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig, saveConfig } from "../../src/utils/config.js";
import { extractConventions } from "../../src/conventions/extractor.js";
import { scan } from "../../src/scan.js";
import type { ConventionsConfig } from "../../src/types.js";

/**
 * Sync MUST NOT overwrite user-authored convention fields. The
 * extracted payload is updated every sync so it stays fresh, but the
 * top-level naming / testing / components fields are user-authoritative
 * once init has run. If a user changed `conventions.naming.files`
 * to `"PascalCase"` by hand, a later `sync` that scans a kebab-case
 * codebase must leave their value alone.
 */

async function seedFiles(
  root: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relPath, contents] of Object.entries(files)) {
    const full = path.join(root, relPath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
}

describe("sync-time convention re-extraction", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-sync-extract-"));
    await seedFiles(tmp, {
      "package.json": JSON.stringify({ name: "fx" }),
      "src/lib/user-service.ts": "export const x = 1;",
      "src/lib/auth-service.ts": "export const x = 1;",
      "src/lib/api-client.ts": "export const x = 1;",
      "src/lib/order-helper.ts": "export const x = 1;",
    });
  });

  it("updates conventions.extracted without touching user-edited naming", async () => {
    // Initial scan + save — produces `conventions.naming.files: kebab-case`
    // because the fixture is all kebab.
    const first = await scan({ projectRoot: tmp, detect: true });
    expect(first.config.conventions.naming?.files).toBe("kebab-case");
    await saveConfig(tmp, first.config);

    // User hand-edits their naming convention to PascalCase (hypothetical —
    // they explicitly want the rule to read "PascalCase" regardless of
    // what the extractor finds).
    const loaded = await loadConfig(tmp);
    expect(loaded).not.toBeNull();
    loaded!.conventions.naming = {
      ...(loaded!.conventions.naming ?? {}),
      files: "PascalCase",
    };
    await saveConfig(tmp, loaded!);

    // Simulate sync's convention-refresh step: re-extract and write only
    // into the `extracted` slot.
    const reloaded = (await loadConfig(tmp))!;
    reloaded.conventions.extracted = await extractConventions(tmp);
    await saveConfig(tmp, reloaded);

    // User's edit survives.
    const final = (await loadConfig(tmp))!;
    expect(final.conventions.naming?.files).toBe("PascalCase");
    // But the extracted record reflects the actual code (kebab-case).
    expect(final.conventions.extracted?.naming?.files).toBe("kebab-case");
  });

  it("honors conventions.extract === false as an opt-out", async () => {
    const first = await scan({ projectRoot: tmp, detect: true });
    const untouchedExtracted = first.config.conventions.extracted;
    expect(untouchedExtracted).toBeDefined();

    // Opt out and save.
    const opted: ConventionsConfig = {
      ...first.config.conventions,
      extract: false,
    };
    first.config.conventions = opted;
    await saveConfig(tmp, first.config);

    // Simulate sync's gate on `conventions.extract !== false`: no update.
    const reloaded = (await loadConfig(tmp))!;
    if (reloaded.conventions.extract !== false) {
      reloaded.conventions.extracted = await extractConventions(tmp);
    }
    await saveConfig(tmp, reloaded);

    const final = (await loadConfig(tmp))!;
    // Extracted payload unchanged (same timestamps / values as first scan).
    expect(final.conventions.extract).toBe(false);
    expect(final.conventions.extracted).toEqual(untouchedExtracted);
  });
});
