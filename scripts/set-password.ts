// Change an account's password:  npm run user:password -- dm@uthandar.local "new password"
import "./_env";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "@/db/client";
import { users, sessions } from "@/db/schema";
import { hashPassword } from "@/lib/auth";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error('Usage: npm run user:password -- <email> "<new password, at least 10 characters>"');
  process.exit(1);
}
const db = await getDb();
const [u] = await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.email, email.toLowerCase())).returning();
if (!u) console.error(`No account with email ${email}.`);
else {
  await db.delete(sessions).where(eq(sessions.userId, u.id)); // sign out everywhere
  console.log(`Password changed for ${u.email}. Existing sign-ins were ended.`);
}
await closeDb();
