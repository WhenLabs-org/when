import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);

console.log(`sample-app listening on :${env.PORT}`);
