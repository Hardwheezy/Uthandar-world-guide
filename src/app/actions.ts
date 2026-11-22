"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, verifyCredentials, cookieOptions, SESSION_COOKIE, PREVIEW_COOKIE } from "@/lib/auth";
import { getViewer } from "@/lib/viewer";
import { isEditor } from "@/lib/access";

function safeNext(next: unknown) {
  const n = typeof next === "string" ? next : "/";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export async function login(_prev: { error: string | null }, form: FormData) {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const user = await verifyCredentials(email, password);
  if (!user) return { error: "That email and password don't match an account." };
  const { token, expiresAt } = await createSession(user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  jar.delete(PREVIEW_COOKIE);
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  jar.delete(PREVIEW_COOKIE);
  redirect("/");
}

export async function setPreview(form: FormData) {
  const jar = await cookies();
  const on = form.get("preview") === "on";
  const v = await getViewer();
  if (on && isEditor(v)) jar.set(PREVIEW_COOKIE, "public", cookieOptions());
  else jar.delete(PREVIEW_COOKIE);
  redirect(safeNext(form.get("back")));
}
