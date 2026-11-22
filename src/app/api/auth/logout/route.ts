import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE, PREVIEW_COOKIE } from "@/lib/auth";
import { json } from "@/lib/http";

export async function POST() {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  jar.delete(PREVIEW_COOKIE);
  return json({ ok: true });
}
