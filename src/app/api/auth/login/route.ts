import { cookies } from "next/headers";
import { createSession, verifyCredentials, cookieOptions, SESSION_COOKIE, PREVIEW_COOKIE } from "@/lib/auth";
import { json } from "@/lib/http";

/** JSON sign-in for scripts and API clients. Browsers use the /login form. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: "Cross-site request refused." }, 403);
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const user = body.email && body.password ? await verifyCredentials(String(body.email), String(body.password)) : null;
  if (!user) return json({ error: "That email and password don't match an account." }, 401);
  const { token, expiresAt } = await createSession(user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  jar.delete(PREVIEW_COOKIE);
  return json({ ok: true, role: user.role, displayName: user.displayName });
}
