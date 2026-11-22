/**
 * Database connection.
 *
 * - DATABASE_URL=postgres://...  → a real PostgreSQL server (production / shared use)
 * - otherwise                    → PGlite: real Postgres compiled to WASM, running in-process,
 *                                   persisted to PGLITE_DIR (default ./.data/pglite). Zero install.
 *
 * Both drivers expose the same Drizzle query API, so app code doesn't care which one is in use.
 * PGlite allows ONE process per data directory: stop `npm run dev` before running CLI scripts.
 */
import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type DB = PgliteDatabase<typeof schema>;

type Holder = { db?: DB; close?: () => Promise<void> };
const g = globalThis as unknown as { __uthandarDb?: Holder };
const holder: Holder = (g.__uthandarDb ??= {});

export function pgliteDir() {
  return process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
}

async function connect(): Promise<Holder> {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: url });
    return {
      db: drizzle(pool, { schema }) as unknown as DB,
      close: () => pool.end(),
    };
  }
  const dir = pgliteDir();
  if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir === "memory://" ? undefined : dir);
  return { db: drizzlePglite(client, { schema }), close: () => client.close() };
}

let connecting: Promise<Holder> | null = null;

export async function getDb(): Promise<DB> {
  if (holder.db) return holder.db;
  connecting ??= connect().then((h) => {
    holder.db = h.db;
    holder.close = h.close;
    return h;
  });
  await connecting;
  return holder.db!;
}

/** Tests and scripts can inject their own database. */
export function setDb(db: DB, close?: () => Promise<void>) {
  holder.db = db;
  holder.close = close;
}

export async function closeDb() {
  await holder.close?.();
  holder.db = undefined;
  holder.close = undefined;
  connecting = null;
}

export { schema };
