import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { isEditor } from "@/lib/access";
import { ledgerOverview, listArticles } from "@/lib/queries";
import { STATUSES, STATUS_INFO, TYPE_LABEL, type ArticleType } from "@/lib/vocab";
import { StatusBadge, DmBadge } from "@/components/Badges";
import { RestoreButton } from "@/components/RestoreButton";
import { CollabPanel } from "./CollabPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "DM Ledger" };

export default async function LedgerPage() {
  const viewer = await getViewer();
  if (!isEditor(viewer)) redirect("/login?next=/ledger");
  if (viewer.preview) redirect("/");
  const o = (await ledgerOverview(viewer))!;
  const notes = (await listArticles(viewer, { order: "title" })).filter((a) => a.visibility === "dm");
  const tally = (status: string, vis: string) => Number(o.byStatus.find((s) => s.status === status && s.visibility === vis)?.n ?? 0);

  return (
    <>
      <header className="ledger-page-head">
        <h1>DM Ledger</h1>
        <p>Everything in the guide, including what visitors never see. Signed in as {viewer.displayName}.</p>
        <div className="ledger-actions">
          <Link className="btn btn-primary" href="/new">
            New entry
          </Link>
          <a className="btn" href="/api/export?format=json">
            Export everything (JSON)
          </a>
          <a className="btn" href="/api/export?format=markdown">
            Export everything (Markdown)
          </a>
        </div>
      </header>

      <div className="ledger-cols">
        <section>
          <h2 className="section-title">Entries by status</h2>
          <table className="tally">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col" className="n">
                  In the guide
                </th>
                <th scope="col" className="n">
                  DM only
                </th>
              </tr>
            </thead>
            <tbody>
              {STATUSES.map((s) => (
                <tr key={s}>
                  <td title={STATUS_INFO[s].help}>
                    <StatusBadge status={s} />
                  </td>
                  <td className="n">{tally(s, "public")}</td>
                  <td className="n">{tally(s, "dm")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="source-note" style={{ marginTop: "0.8rem" }}>
            Status is editorial truth. Visibility is who can read it. They are set separately on every entry, section, fact, and connection.
          </p>
        </section>

        <section>
          <h2 className="section-title">In the guide but not yet canon</h2>
          {o.review.length ? (
            <ul className="plain-list">
              {o.review.map((a) => (
                <li key={a.id}>
                  <Link href={`/a/${a.slug}`}>{a.title}</Link> <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-note">Every public entry is canon.</p>
          )}
        </section>

        <section>
          <h2 className="section-title">Recently changed</h2>
          <ul className="plain-list">
            {o.recent.map((a) => (
              <li key={a.id}>
                <Link href={`/a/${a.slug}`}>{a.title}</Link>
                {a.visibility === "dm" && (
                  <>
                    {" "}
                    <DmBadge />
                  </>
                )}
                <span className="hint">{a.updatedAt.toISOString().slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section style={{ marginTop: "3rem" }} aria-labelledby="collab-title">
        <h2 id="collab-title" className="section-title">
          Collaborators
        </h2>
        <CollabPanel />
        {o.proposals.length > 0 && (
          <>
            <h3 className="side-h3" style={{ marginTop: "1.6rem" }}>
              Recent proposals from collaborators
            </h3>
            <ul className="rev-list">
              {o.proposals.map((p) => (
                <li key={p.id}>
                  <span className="rev-when">
                    {p.slug ? <Link href={`/a/${p.slug}`}>{p.title}</Link> : p.title} <span className="hint">by {p.actor}</span>
                  </span>
                  <span className="rev-detail">{p.note}</span>
                  <span className="rev-actions">
                    {p.slug && (
                      <Link className="btn" href={`/a/${p.slug}/edit`}>
                        Review
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section style={{ marginTop: "3rem" }}>
        <h2 className="section-title">DM-only entries ({notes.length})</h2>
        <p className="source-note">Includes the imported starter wiki. Nothing here is visible to visitors until you change its visibility.</p>
        <ul className="plain-list" style={{ columns: "18rem", columnGap: "2.5rem", display: "block" }}>
          {notes.map((a) => (
            <li key={a.id} style={{ breakInside: "avoid", marginBottom: "0.35rem" }}>
              <Link href={`/a/${a.slug}`}>{a.title}</Link> <StatusBadge status={a.status} />
              <span className="hint">{TYPE_LABEL[a.type as ArticleType] ?? a.type}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: "3rem" }}>
        <h2 className="section-title">Recently deleted</h2>
        {o.deleted.length ? (
          <ul className="rev-list">
            {o.deleted.map((d) => (
              <li key={d.id}>
                <span className="rev-when">{d.title}</span>
                <span className="rev-detail">Deleted {new Date(d.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
                <span className="rev-actions">
                  <RestoreButton revisionId={d.id} label="Restore entry" />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-note">Nothing has been deleted. Deleted entries stay here and can be restored.</p>
        )}
      </section>
    </>
  );
}
