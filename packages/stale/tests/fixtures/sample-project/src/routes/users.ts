const dbUrl = process.env.DATABASE_URL;
const apiSecret = process.env.API_SECRET;
const nodeEnv = process.env.NODE_ENV;

export function getUser(id: string) {
  // query using DATABASE_URL
  return { id };
}
