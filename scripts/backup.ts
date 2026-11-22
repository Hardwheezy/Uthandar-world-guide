import "./_env";
import fs from "node:fs";
import path from "node:path";
import { getDb, closeDb } from "@/db/client";
import { dumpDatabase } from "@/db/backup";

const dump = await dumpDatabase(await getDb());
fs.mkdirSync("backups", { recursive: true });
const file = path.join("backups", `uthandar-${dump.createdAt.replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(dump, null, 2));
const counts = Object.entries(dump.tables).map(([k, v]) => `${k}: ${v.length}`).join(", ");
console.log(`Backup written to ${file}\n${counts}\nThis file contains password hashes. Keep it private.`);
await closeDb();
