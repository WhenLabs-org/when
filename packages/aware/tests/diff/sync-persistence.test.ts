import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { extractStampedHash } from "../../src/core/hash.js";
import { scan } from "../../src/scan.js";
import type { TargetsConfig } from "../../src/types.js";

const targets: TargetsConfig = {
  claude: true,
  cursor: false,
  copilot: false,
  agents: false,
};

/**
 * Sync persistence is exercised indirectly: we run the scan pipeline
 * (which is what sync uses to compute generator output), then verify the
 * per-file hash embedded in each generator result survives through to what
 * sync would store in `_meta.fileHashes`.
 */
describe("per-file hash provenance", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-sync-persist-"));
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "sync-persist",
        dependencies: { next: "^15.1.0" },
      }),
    );
  });

  it("each generated file carries a stamped hash extractable by sync", async () => {
    const result = await scan({ projectRoot: tmp, targets, detect: true });
    for (const file of result.generatedFiles) {
      const hash = extractStampedHash(file.content);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    }
  });
});
