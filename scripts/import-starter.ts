import "./_env";
import path from "node:path";
import { getDb, closeDb } from "@/db/client";
import { importStarter } from "@/db/import-starter";

const dir = path.resolve(process.argv[2] ?? "content/starter-wiki");
console.log(`Importing starter notes from ${dir} (all as DM-only)…`);
const r = await importStarter(await getDb(), dir);
console.log(`Imported ${r.imported} of ${r.total} notes.`);
await closeDb();
