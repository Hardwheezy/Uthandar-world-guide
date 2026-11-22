import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
  if ((await getViewer()).userId) redirect(safe);
  return <LoginForm next={safe} />;
}
