import "./_env";
import fs from "node:fs";
import { getDb, closeDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { restoreDatabase } from "@/db/backup";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run restore -- backups/uthandar-<timestamp>.json");
  process.exit(1);
}
const db = await getDb();
try {
  await runMigrations(db);
  await restoreDatabase(db, JSON.parse(fs.readFileSync(file, "utf8")));
  console.log(`Restored from ${file}.`);
} catch (e) {
  console.error(`Restore stopped: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
