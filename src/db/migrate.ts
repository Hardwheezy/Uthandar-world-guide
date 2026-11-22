import path from "node:path";
import type { DB } from "./client";

export async function runMigrations(db: DB) {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (process.env.DATABASE_URL && /^postgres/.test(process.env.DATABASE_URL)) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder });
  }
}
