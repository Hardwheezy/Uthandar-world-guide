/**
 * Minimal, server-side session auth.
 * - Passwords: bcrypt (bcryptjs, pure JS — no native build on Windows).
 * - Sessions: random 32-byte token in an httpOnly cookie; only its SHA-256 is stored.
 * - Preview: a separate cookie that can only DOWNGRADE what a session reads.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiTokens, sessions, users } from "@/db/schema";
import { isNull } from "drizzle-orm";
import { ANONYMOUS, type Viewer } from "./access";

export const SESSION_COOKIE = "uth_session";
export const PREVIEW_COOKIE = "uth_preview";
const SESSION_DAYS = 14;
let dummyHash: string | undefined;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

function tokenId(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function verifyCredentials(email: string, password: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  // Compare against a dummy hash when the user doesn't exist to keep timing flat.
  dummyHash ??= bcrypt.hashSync("not-a-real-password", 11);
  const hash = u?.passwordHash ?? dummyHash;
  const ok = await bcrypt.compare(password, hash);
  return ok && u ? u : null;
}

export async function createSession(userId: string) {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: tokenId(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.id, tokenId(token)));
}

export async function viewerFromTokens(token: string | undefined, previewCookie: string | undefined): Promise<Viewer> {
  if (!token || token.length > 200) return ANONYMOUS;
  const db = await getDb();
  const [row] = await db
    .select({ userId: users.id, role: users.role, displayName: users.displayName })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, tokenId(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return ANONYMOUS;
  return {
    userId: row.userId,
    role: row.role,
    displayName: row.displayName,
    preview: previewCookie === "public",
    via: "session",
  };
}

export function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.COOKIE_SECURE === "true",
    ...(expires ? { expires } : {}),
  };
}

// ---- API keys -------------------------------------------------------------

export const API_KEY_PREFIX = "uth_";

export async function createApiToken(name: string, role: "agent" | "editor", createdBy: string | null) {
  const db = await getDb();
  const raw = API_KEY_PREFIX + crypto.randomBytes(24).toString("base64url");
  const [row] = await db
    .insert(apiTokens)
    .values({ name: name.trim().slice(0, 60), role, tokenHash: tokenId(raw), prefix: raw.slice(0, 10), createdBy })
    .returning();
  return { token: raw, row };
}

export async function revokeApiToken(id: string) {
  const db = await getDb();
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id));
}

/** Resolve "Authorization: Bearer uth_…". Unknown or revoked keys read as an anonymous visitor. */
export async function viewerFromApiKey(raw: string): Promise<Viewer> {
  if (!raw.startsWith(API_KEY_PREFIX) || raw.length > 200) return ANONYMOUS;
  const db = await getDb();
  const [t] = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, tokenId(raw)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!t) return ANONYMOUS;
  if (!t.lastUsedAt || Date.now() - t.lastUsedAt.getTime() > 5 * 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, t.id));
  }
  return { userId: null, role: t.role, displayName: t.name, preview: false, via: "token" };
}
