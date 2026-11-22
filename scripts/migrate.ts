import "./_env";
import { getDb, closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";

const db = await getDb();
await runMigrations(db);
console.log("Migrations applied.");
await closeDb();
