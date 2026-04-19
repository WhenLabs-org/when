import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { extractConventions } from "../../src/conventions/extractor.js";
import { scan } from "../../src/scan.js";

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

describe("extractConventions end-to-end", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aware-extract-e2e-"));
  });

  it("reports the dominant kebab-case naming with PascalCase components", async () => {
    await seedFiles(tmp, {
      "package.json": JSON.stringify({ name: "fx" }),
      "src/lib/user-service.ts": "export const x = 1;",
      "src/lib/auth-service.ts": "export const x = 1;",
      "src/lib/api-client.ts": "export const x = 1;",
      "src/lib/order-helper.ts": "export const x = 1;",
      "src/components/Button.tsx": "export const Button = () => null;",
      "src/components/UserCard.tsx": "export const UserCard = () => null;",
      "src/components/LoginForm.tsx": "export const LoginForm = () => null;",
    });

    const extracted = await extractConventions(tmp);
    expect(extracted.naming?.files).toBe("kebab-case");
    expect(extracted.naming?.components).toBe("PascalCase");
    expect(extracted._confidence?.naming).toBeGreaterThanOrEqual(0.7);
  });

  it("reports colocated test layout when tests live next to source", async () => {
    await seedFiles(tmp, {
      "package.json": JSON.stringify({ name: "fx" }),
      "src/auth/login.ts": "export const x = 1;",
      "src/auth/login.test.ts": "import './login';",
      "src/orders/order.ts": "export const x = 1;",
      "src/orders/order.test.ts": "import './order';",
      "src/lib/utils.ts": "export const x = 1;",
      "src/lib/utils.test.ts": "import './utils';",
    });

    const extracted = await extractConventions(tmp);
    expect(extracted.tests?.layout).toBe("colocated");
  });

  it("reports route-based layout for projects with an app/ or pages/ dir", async () => {
    await seedFiles(tmp, {
      "package.json": JSON.stringify({ name: "fx" }),
      "src/app/layout.tsx": "export default () => null;",
      "src/app/page.tsx": "export default () => null;",
      "src/app/about/page.tsx": "export default () => null;",
    });

    const extracted = await extractConventions(tmp);
    expect(extracted.layout?.pattern).toBe("route-based");
  });

  it("extracted conventions are stored on scan output and merged into conventions", async () => {
    await seedFiles(tmp, {
      "package.json": JSON.stringify({ name: "fx" }),
      "src/lib/user-service.ts": "export const x = 1;",
      "src/lib/auth-service.ts": "export const x = 1;",
      "src/lib/api-client.ts": "export const x = 1;",
      "src/lib/order-helper.ts": "export const x = 1;",
    });

    const result = await scan({ projectRoot: tmp, detect: true });
    expect(result.config.conventions.extracted).toBeDefined();
    expect(result.config.conventions.extracted!.naming?.files).toBe(
      "kebab-case",
    );
    // Merged into the top-level naming block too.
    expect(result.config.conventions.naming?.files).toBe("kebab-case");
  });

  it("respects scan({ extractConventions: false })", async () => {
    await seedFiles(tmp, {
      "package.json": JSON.stringify({ name: "fx" }),
      "src/lib/user-service.ts": "export const x = 1;",
    });

    const result = await scan({
      projectRoot: tmp,
      detect: true,
      extractConventions: false,
    });
    expect(result.config.conventions.extracted).toBeUndefined();
  });

  it("low-confidence naming is omitted (below the 0.7 threshold)", async () => {
    await seedFiles(tmp, {
      "package.json": JSON.stringify({ name: "fx" }),
      // Exactly 50/50 mix → confidence < 0.7 → naming not reported.
      "src/user-profile.ts": "export const x = 1;",
      "src/auth-service.ts": "export const x = 1;",
      "src/userProfile.ts": "export const x = 1;",
      "src/authService.ts": "export const x = 1;",
    });

    const extracted = await extractConventions(tmp);
    expect(extracted.naming).toBeUndefined();
  });
});
