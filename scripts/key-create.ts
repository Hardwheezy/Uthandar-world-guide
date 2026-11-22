// Issue an API key for a collaborator:  npm run key:create -- "Vee"   (add --editor for full rights)
import "./_env";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";
import { users } from "@/db/schema";
import { createApiToken } from "@/lib/auth";

const name = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!name) {
  console.error('Usage: npm run key:create -- "Vee" [--editor]');
  process.exit(1);
}
const role = process.argv.includes("--editor") ? "editor" : "agent";
const db = await getDb();
const [dm] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
const { token } = await createApiToken(name, role, dm?.id ?? null);
console.log(`API key for ${name} (${role === "agent" ? "collaborator: proposals only" : "EDITOR: full rights"}):\n\n  ${token}\n\nShown once. Store it in the collaborator's settings, not in the repository.`);
await closeDb();
