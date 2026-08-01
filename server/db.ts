import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Prefer SUPABASE_DATABASE_URL so the app always uses the Supabase instance
// even when Replit's managed DATABASE_URL is available in the environment.
const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("No database URL configured.");
}

export const pool = new Pool({
  connectionString: databaseUrl,
});
export const db = drizzle(pool, { schema });
