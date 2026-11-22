/** Resolve the current Viewer from the request (server components, actions, route handlers). */
import { cookies, headers } from "next/headers";
import { PREVIEW_COOKIE, SESSION_COOKIE, viewerFromTokens, viewerFromApiKey } from "./auth";
import { ANONYMOUS, type Viewer } from "./access";

function bearer(h: Headers) {
  const a = h.get("authorization");
  return a && /^Bearer\s+/i.test(a) ? a.replace(/^Bearer\s+/i, "").trim() : null;
}

export async function getViewer(): Promise<Viewer> {
  const h = await headers();
  const key = bearer(h);
  // An Authorization header always wins. A bad key is anonymous, never a cookie fallback.
  if (key !== null) return key ? viewerFromApiKey(key) : ANONYMOUS;
  const jar = await cookies();
  return viewerFromTokens(jar.get(SESSION_COOKIE)?.value, jar.get(PREVIEW_COOKIE)?.value);
}

/**
 * CSRF guard for JSON mutations. Cookie-authenticated requests must come from this
 * site's own origin (session cookies are also SameSite=Lax). Requests authenticated
 * with an API key carry no ambient credentials, so they are not CSRF-able.
 */
export async function mutationAllowed(req: Request) {
  if (bearer(req.headers)) return true;
  const origin = req.headers.get("origin");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
