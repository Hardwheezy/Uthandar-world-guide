// Delete the local PGlite database and set it up again from scratch.
import "./_env";
import fs from "node:fs";
import { pgliteDir } from "@/db/client";

if (process.env.DATABASE_URL) {
  console.error("Refusing to reset: DATABASE_URL points at a real Postgres server. Drop that database yourself.");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error(`This deletes ${pgliteDir()} and everything in it.\nTake a backup first (npm run backup), then run: npm run db:reset -- --yes`);
  process.exit(1);
}
fs.rmSync(pgliteDir(), { recursive: true, force: true });
console.log(`Deleted ${pgliteDir()}. Run \`npm run setup\` to start fresh.`);
