import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import "@fontsource/alegreya/400.css";
import "@fontsource/alegreya/400-italic.css";
import "@fontsource/alegreya/700.css";
import "@fontsource/alegreya/800.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
import "./globals.css";
import { getViewer } from "@/lib/viewer";
import { isEditor, seesDm } from "@/lib/access";
import { getWorld } from "@/lib/queries";
import { CATEGORIES } from "@/lib/vocab";
import { Nav } from "@/components/Nav";
import { SearchBox } from "@/components/SearchBox";
import { logout, setPreview } from "./actions";

export const metadata: Metadata = {
  title: { default: "Uthandar: the Adventurer's Guild guide", template: "%s | Uthandar" },
  description: "A field guide to the world of Uthandar.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const world = await getWorld();
  const path = (await headers()).get("x-pathname") ?? "/";
  const navItems = [
    { href: "/explore", label: "Explore" },
    ...CATEGORIES.map((c) => ({ href: `/c/${c.slug}`, label: c.label })),
    ...(seesDm(viewer) ? [{ href: "/ledger", label: "DM Ledger", ledger: true }] : []),
  ];

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {viewer.preview && isEditor(viewer) && (
          <div className="preview-banner" role="status">
            <div className="preview-banner-inner">
              <span>
                <strong>Public preview.</strong> You are seeing exactly what a visitor sees. DM material is not loaded.
              </span>
              <form action={setPreview}>
                <input type="hidden" name="preview" value="off" />
                <input type="hidden" name="back" value={path} />
                <button className="btn" type="submit">
                  Return to DM view
                </button>
              </form>
            </div>
          </div>
        )}
        <header className="masthead">
          <div className="masthead-inner">
            <Link href="/" className="wordmark">
              {world?.name ?? "Uthandar"}
              <small>Adventurer&apos;s Guild guide</small>
            </Link>
            <Nav items={navItems} />
            <div className="masthead-tools">
              <SearchBox key={seesDm(viewer) ? "dm" : "public"} />
              {viewer.userId ? (
                <form action={logout}>
                  <button className="btn btn-quiet" type="submit" title={`Signed in as ${viewer.displayName}`}>
                    Sign out
                  </button>
                </form>
              ) : (
                <Link className="btn btn-quiet" href={`/login?next=${encodeURIComponent(path)}`}>
                  DM sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="site-foot">
          <div className="site-foot-inner">
            <span>Entries marked Draft or Proposed are not yet confirmed setting truth.</span>
            <a href="/api/export?format=markdown">Download the public guide (Markdown)</a>
            <a href="/api/export?format=json">(JSON)</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
