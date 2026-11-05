import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Shared by the Next.js app and the realtime server. Server-side only: it connects as the
// database owner, so every query must be scoped to an authenticated user by the caller.
const globalForDb = globalThis as unknown as { kindlySql?: postgres.Sql };

function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Serverless functions (Vercel) each get one connection; long-running servers share a small pool.
  // Supabase's transaction pooler (port 6543) doesn't support prepared statements.
  return postgres(url, { max: process.env.VERCEL ? 1 : 5, idle_timeout: 20, prepare: !url.includes(":6543/") });
}

const sql = globalForDb.kindlySql ?? createSql();
if (process.env.NODE_ENV !== "production") globalForDb.kindlySql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { schema };
