import { describe, it, expect, afterEach, vi } from "vitest";
import { log, setSilent } from "../../src/utils/logger.js";

/**
 * Silent mode is the guarantee that `aware diff --json` can't have its
 * stdout corrupted by transitive log calls. These tests lock that in.
 *
 * Uses `vi.spyOn(console, ...)` rather than intercepting process.stdout
 * directly: vitest hooks into console.log / console.error early, so
 * process.stdout.write replacements are a no-op.
 */

describe("logger silent mode", () => {
  afterEach(() => {
    setSilent(false);
    vi.restoreAllMocks();
  });

  it("info/warn/success/plain/dim/header call console.log by default", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    log.info("a");
    log.warn("b");
    log.success("c");
    log.plain("d");
    log.dim("e");
    log.header("f");
    expect(spy).toHaveBeenCalledTimes(6);
  });

  it("setSilent(true) suppresses all non-error logs", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    setSilent(true);
    log.info("suppressed-info");
    log.warn("suppressed-warn");
    log.success("suppressed-success");
    log.plain("suppressed-plain");
    log.dim("suppressed-dim");
    log.header("suppressed-header");
    expect(spy).not.toHaveBeenCalled();
  });

  it("errors still reach console.error regardless of silent mode", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    setSilent(true);
    log.error("boom");
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy.mock.calls[0]!.join(" ")).toContain("boom");
    expect(outSpy).not.toHaveBeenCalled();
  });
});
