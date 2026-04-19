import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWatch } from "../../src/commands/watch.js";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("runWatch", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "envalid-watch-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("emits an initial report and re-runs on env changes", async () => {
    const schemaPath = join(dir, ".env.schema");
    const envPath = join(dir, ".env");
    writeFileSync(
      schemaPath,
      "version: 1\nvariables:\n  PORT:\n    type: integer\n    required: true\n",
    );
    writeFileSync(envPath, "PORT=3000\n");
    const reports: string[] = [];
    const stop = runWatch({
      schemaPath,
      envPath,
      format: "json",
      onReport: (t) => reports.push(t),
    });
    try {
      // initial report
      expect(reports.some((r) => r.includes('"valid":'))).toBe(true);
      const initialLength = reports.length;
      writeFileSync(envPath, "PORT=abc\n");
      await delay(400);
      expect(reports.length).toBeGreaterThan(initialLength);
      const last = reports[reports.length - 1];
      expect(last).toContain('"valid": false');
    } finally {
      stop();
    }
  });
});
