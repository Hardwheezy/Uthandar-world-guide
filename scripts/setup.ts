// One command for a fresh install: migrate, seed the Uthandar entries, import the starter notes.
import "./_env";
import path from "node:path";
import { getDb, closeDb, pgliteDir } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seed } from "@/db/seed";
import { importStarter } from "@/db/import-starter";

if (!process.env.DATABASE_URL) console.log(`Using PGlite database at ${pgliteDir()}`);
const db = await getDb();
await runMigrations(db);
console.log("Migrations applied.");
await seed(db);
const r = await importStarter(db, path.resolve("content/starter-wiki"), () => {});
console.log(`Starter wiki: imported ${r.imported} of ${r.total} notes as DM-only.`);
await closeDb();
console.log("\nSetup complete. Run `npm run dev` and open http://localhost:3000");
