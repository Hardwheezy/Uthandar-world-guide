// List or revoke collaborator API keys:  npm run key:list   |   npm run key:revoke -- "Vee"
import "./_env";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";
import { apiTokens } from "@/db/schema";

const db = await getDb();
const name = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!name) {
  const keys = await db.select().from(apiTokens).orderBy(apiTokens.createdAt);
  if (!keys.length) console.log("No API keys.");
  for (const k of keys)
    console.log(`${k.name.padEnd(16)} ${k.role.padEnd(7)} ${k.prefix}…  ${k.revokedAt ? "REVOKED" : "active"}  last used: ${k.lastUsedAt?.toISOString() ?? "never"}`);
} else {
  const r = await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.name, name), isNull(apiTokens.revokedAt))).returning();
  console.log(r.length ? `Revoked ${r.length} key(s) named ${name}.` : `No active key named ${name}.`);
}
await closeDb();
