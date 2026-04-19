import type { Config } from "drizzle-kit";
export default { schema: "./src/db/schema.ts", driver: "pg" } satisfies Config;
