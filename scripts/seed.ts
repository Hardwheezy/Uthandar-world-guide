import "./_env";
import { getDb, closeDb } from "@/db/client";
import { seed } from "@/db/seed";

await seed(await getDb());
await closeDb();
