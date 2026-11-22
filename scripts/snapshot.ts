// Write content/world/ (all entries as Markdown, DM material included) for collaborators.
import "./_env";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";
import { users } from "@/db/schema";
import { writeSnapshot } from "@/lib/inbox";

const db = await getDb();
const [dm] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
const r = await writeSnapshot({ userId: dm.id, role: "admin", displayName: dm.displayName, preview: false });
console.log(`Wrote ${r.written} files to ${r.dir}${r.removed ? `, removed ${r.removed} stale` : ""}. Keep the repository private.`);
await closeDb();
