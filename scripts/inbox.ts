// Import content/inbox/ from the command line (stop `npm run dev` first when using PGlite).
import "./_env";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";
import { users } from "@/db/schema";
import { importInbox, INBOX_DIR } from "@/lib/inbox";

const db = await getDb();
const [dm] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
const results = await importInbox({ userId: dm.id, role: "admin", displayName: dm.displayName, preview: false }, process.argv[2] ?? INBOX_DIR());
for (const r of results) console.log(`${r.outcome.padEnd(8)} ${r.file}${r.slug ? ` → /a/${r.slug}` : ""}  ${r.detail}`);
if (!results.length) console.log("Inbox is empty.");
await closeDb();
