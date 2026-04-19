import { z } from "zod";

export const renameOp = z.object({
  rename: z.object({
    from: z.string(),
    to: z.string(),
  }),
});

export const removeOp = z.object({
  remove: z.object({
    variable: z.string(),
  }),
});

export const retypeOp = z.object({
  retype: z.object({
    variable: z.string(),
    to: z.string(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  }),
});

export const migrationOp = z.union([renameOp, removeOp, retypeOp]);

export const migrationFile = z.object({
  version: z.number().default(1),
  id: z.string().optional(),
  migrations: z.array(migrationOp),
});

export type MigrationOp = z.infer<typeof migrationOp>;
export type MigrationFile = z.infer<typeof migrationFile>;
