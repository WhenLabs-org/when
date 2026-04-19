import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { scan } from "../../src/scan.js";

/**
 * End-to-end check that a real project's lockfile routes to the right
 * version-specific fragment. This is the Phase 2 headline: a Next 14
 * project gets Next-14 guidance, a Next 15 project gets Next-15 guidance,
 * even when the package.json range is identical.
 */

async function seed(
  tmp: string,
  opts: {
    nextRange: string;
    nextResolved: string;
    tailwindRange?: string;
    tailwindResolved?: string;
  },
): Promise<void> {
  const deps: Record<string, string> = { next: opts.nextRange, react: "^19.0.0" };
  if (opts.tailwindRange) deps["tailwindcss"] = opts.tailwindRange;
  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "fx", dependencies: deps }),
  );
  // App-router variant is required for the nextjs-14/15 fragments to
  // fire; pages-router has its own fragment.
  await fs.mkdir(path.join(tmp, "app"));
  await fs.writeFile(path.join(tmp, "app", "page.tsx"), "export default () => null;");

  const importers: Record<string, unknown> = {
    ".": {
      dependencies: {
        next: { specifier: opts.nextRange, version: opts.nextResolved },
        react: { specifier: "^19.0.0", version: "19.0.0" },
        ...(opts.tailwindRange && opts.tailwindResolved
          ? {
              tailwindcss: {
                specifier: opts.tailwindRange,
                version: opts.tailwindResolved,
              },
            }
          : {}),
      },
    },
  };
  const yaml = renderPnpmLockfile(importers);
  await fs.writeFile(path.join(tmp, "pnpm-lock.yaml"), yaml);
}

function renderPnpmLockfile(importers: Record<string, unknown>): string {
  // Minimal yaml rendering — tests control the shape explicitly so we
  // don't need a real YAML emitter here.
  const lines: string[] = ["lockfileVersion: '9.0'", "importers:"];
  for (const [pkgKey, importer] of Object.entries(importers)) {
    lines.push(`  ${pkgKey}:`);
    for (const field of ["dependencies", "devDependencies"] as const) {
      const deps = (importer as Record<string, unknown>)[field];
      if (!deps || typeof deps !== "object") continue;
      lines.push(`    ${field}:`);
      for (const [name, spec] of Object.entries(deps as Record<string, unknown>)) {
        const s = spec as { specifier: string; version: string };
        lines.push(`      ${name}:`);
        lines.push(`        specifier: ${s.specifier}`);
        lines.push(`        version: ${s.version}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

describe("version-aware fragment routing", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-version-route-"));
  });

  it("Next 15 lockfile → nextjs-15 fragment (mentions fetch-no-longer-cached)", async () => {
    await seed(tmp, { nextRange: "^15.1.0", nextResolved: "15.1.2" });
    const result = await scan({ projectRoot: tmp, detect: true });
    const fw = result.fragments.find((f) => f.id === "nextjs-app-router");
    expect(fw).toBeDefined();
    // Next 15 guidance calls out the caching inversion.
    expect(fw!.content).toContain("no longer cached");
  });

  it("Next 14 lockfile → nextjs-14 fragment (mentions fetch-cached-by-default)", async () => {
    await seed(tmp, { nextRange: "^14.2.0", nextResolved: "14.2.10" });
    const result = await scan({ projectRoot: tmp, detect: true });
    const fw = result.fragments.find((f) => f.id === "nextjs-app-router");
    expect(fw).toBeDefined();
    expect(fw!.content).toContain("cached by default");
  });

  it("Next 14 range with a Next 15 lockfile resolution still routes to nextjs-15", async () => {
    // package.json says "^14.0.0" (the author wrote it a year ago) but the
    // lockfile actually resolved 15.x — lockfile wins, fragment routes to 15.
    await seed(tmp, { nextRange: "^14.0.0", nextResolved: "15.0.3" });
    const result = await scan({ projectRoot: tmp, detect: true });
    const fw = result.fragments.find((f) => f.id === "nextjs-app-router");
    expect(fw!.content).toContain("no longer cached");
  });

  it("Tailwind 4 → tailwind-4 fragment (mentions CSS-native @theme)", async () => {
    await seed(tmp, {
      nextRange: "^15.1.0",
      nextResolved: "15.1.2",
      tailwindRange: "^4.0.0",
      tailwindResolved: "4.0.0",
    });
    const result = await scan({ projectRoot: tmp, detect: true });
    const styling = result.fragments.find((f) => f.id === "tailwindcss");
    expect(styling).toBeDefined();
    expect(styling!.content).toContain("@theme");
    // v4 fragment explicitly calls out "No tailwind.config.js" — that's
    // the right shape of the negative guidance. What we really care
    // about is that v4 steers the user at CSS-native config.
    expect(styling!.content).toContain("CSS-native");
    expect(styling!.content).toContain("No");
  });

  it("Tailwind 3 → tailwind-3 fragment (mentions tailwind.config.js)", async () => {
    await seed(tmp, {
      nextRange: "^15.1.0",
      nextResolved: "15.1.2",
      tailwindRange: "^3.4.0",
      tailwindResolved: "3.4.0",
    });
    const result = await scan({ projectRoot: tmp, detect: true });
    const styling = result.fragments.find((f) => f.id === "tailwindcss");
    expect(styling).toBeDefined();
    expect(styling!.content).toContain("tailwind.config.js");
  });

  it("each version-routed fragment carries module.version in Fragment.version", async () => {
    await seed(tmp, { nextRange: "^15.1.0", nextResolved: "15.1.2" });
    const result = await scan({ projectRoot: tmp, detect: true });
    const fw = result.fragments.find((f) => f.id === "nextjs-app-router");
    expect(fw!.version).toBe("15.x");
  });

  it("pages-router still routes to nextjs-pages, not nextjs-14/15", async () => {
    // Seed without an app/ directory so detector picks pages-router.
    const deps = { next: "^15.0.0", react: "^19.0.0" };
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "fx", dependencies: deps }),
    );
    await fs.writeFile(
      path.join(tmp, "pnpm-lock.yaml"),
      `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      next:
        specifier: ^15.0.0
        version: 15.1.2
      react:
        specifier: ^19.0.0
        version: 19.0.0
`,
    );
    // Note: no app/ directory

    const result = await scan({ projectRoot: tmp, detect: true });
    // The app-router fragments (nextjs-14/15) should NOT fire because
    // variant is "pages-router". The pages-router fragment should.
    const appRouter = result.fragments.find((f) => f.id === "nextjs-app-router");
    const pagesRouter = result.fragments.find(
      (f) => f.id === "nextjs-pages-router",
    );
    expect(appRouter).toBeUndefined();
    expect(pagesRouter).toBeDefined();
  });
});
