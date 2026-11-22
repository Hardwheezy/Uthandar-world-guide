import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { seesDm } from "@/lib/access";
import { categoryCounts, getWorld, listArticles, ledgerOverview } from "@/lib/queries";
import { CATEGORIES, TYPE_LABEL, type ArticleType } from "@/lib/vocab";
import { SearchBox } from "@/components/SearchBox";
import { StatusBadge, DmBadge, Tbe } from "@/components/Badges";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer();
  const world = await getWorld();
  if (!world) {
    return (
      <div className="empty-state">
        <p>The guide has no world yet.</p>
        <p>
          Run <code>npm run setup</code> in the project folder, then reload this page.
        </p>
      </div>
    );
  }
  const counts = await categoryCounts(viewer);
  const all = await listArticles(viewer, { excludeNotes: true });
  const recent = await listArticles(viewer, { order: "recent", limit: 6, excludeNotes: true });
  const worldEntry = all.find((a) => a.type === "world");
  const dm = seesDm(viewer);
  const ledger = dm ? await ledgerOverview(viewer) : null;
  const dmNotes = ledger ? ledger.byStatus.filter((s) => s.visibility === "dm").reduce((a, s) => a + Number(s.n), 0) : 0;

  return (
    <>
      <section className="home-hero" aria-labelledby="world-name">
        <h1 id="world-name" className="world-name">
          {world.name}
        </h1>
        <hr className="world-name-rule" />
        <p>{world.tagline ?? "A field guide to the world"}. Look something up, or begin from the contents.</p>
        <SearchBox hero />
      </section>

      <div className="home-grid">
        <section aria-labelledby="contents-title">
          <h2 id="contents-title" className="section-title">
            Contents
          </h2>
          <ul className="contents">
            {worldEntry && (
              <li>
                <Link href={`/a/${worldEntry.slug}`}>
                  <span className="label">The world of {world.name}</span>
                  <span className="count">overview</span>
                </Link>
              </li>
            )}
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`}>
                  <span className="label">{c.label}</span>
                  <span className={`count ${counts[c.slug] ? "" : "none"}`}>
                    {counts[c.slug] ? `${counts[c.slug]} ${counts[c.slug] === 1 ? "entry" : "entries"}` : "none yet"}
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link href="/explore">
                <span className="label">Every entry, A to Z</span>
                <span className="count">{all.length}</span>
              </Link>
            </li>
          </ul>
        </section>

        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className="section-title">
            Recently updated
          </h2>
          {recent.length === 0 ? (
            <p className="empty-note">Nothing has been entered in the guide yet.</p>
          ) : (
            <ul className="entry-list">
              {recent.map((a) => (
                <li key={a.id}>
                  <Link className="entry-title" href={`/a/${a.slug}`}>
                    {a.title}
                  </Link>
                  <div className="entry-meta">
                    <span>{TYPE_LABEL[a.type as ArticleType] ?? a.type}</span>
                    <StatusBadge status={a.status} />
                    {a.visibility === "dm" && <DmBadge />}
                  </div>
                  <p className="entry-summary">{a.summary ?? <Tbe />}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {ledger && (
        <aside className="ledger-strip" aria-label="DM Ledger summary">
          <span>
            <strong>DM Ledger.</strong> {dmNotes} DM-only {dmNotes === 1 ? "entry" : "entries"}, {ledger.review.length} public{" "}
            {ledger.review.length === 1 ? "entry" : "entries"} still in draft or proposed.
          </span>
          <Link href="/ledger">Open the Ledger</Link>
          <Link href="/new">New entry</Link>
        </aside>
      )}
    </>
  );
}
