import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { isEditor, seesDm } from "@/lib/access";
import { listArticles } from "@/lib/queries";
import { AZ } from "@/components/EntryList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Every entry" };

export default async function Explore({ searchParams }: { searchParams: Promise<{ notes?: string }> }) {
  const viewer = await getViewer();
  const { notes } = await searchParams;
  const dm = seesDm(viewer);
  const showNotes = dm && notes === "1";
  const items = await listArticles(viewer, { excludeNotes: !showNotes });
  return (
    <>
      <header className="category-head">
        <nav className="crumbs" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link href="/">Guide</Link>
            </li>
            <li aria-current="page">All entries</li>
          </ol>
        </nav>
        <h1 className="page-title">Every entry, A to Z</h1>
        <p className="lede">Every place, person, faith, and event entered in the guide so far.</p>
        {dm && (
          <p className="source-note" style={{ marginTop: "0.8rem" }}>
            {showNotes ? (
              <Link href="/explore">Hide working notes</Link>
            ) : (
              <Link href="/explore?notes=1">Include working notes (starter wiki, templates, decision log)</Link>
            )}
          </p>
        )}
      </header>
      {items.length ? (
        <AZ items={items} />
      ) : (
        <div className="empty-state">
          <p>Nothing has been entered in the guide yet.</p>
          {isEditor(viewer) && (
            <p>
              <Link href="/new">Write the first entry</Link>
            </p>
          )}
        </div>
      )}
    </>
  );
}
