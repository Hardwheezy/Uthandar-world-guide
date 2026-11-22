import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { isEditor } from "@/lib/access";
import { getArticleForEditing, getRevision, listRevisions } from "@/lib/queries";
import { RestoreButton } from "@/components/RestoreButton";
import type { Snapshot } from "@/lib/mutations";
import { docPlainText, type PMNode } from "@/lib/doc";
import { VISIBILITY_INFO, type Vis } from "@/lib/vocab";
import { StatusBadge } from "@/components/Badges";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

const ACTION: Record<string, string> = {
  create: "Created",
  update: "Saved",
  restore: "Restored",
  delete: "Deleted",
  import: "Imported",
  seed: "Created by setup",
  proposal: "Additions",
};

export default async function HistoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ rev?: string }> }) {
  const { slug } = await params;
  const { rev } = await searchParams;
  const viewer = await getViewer();
  // Public preview is a promise: nothing DM-only renders until the DM leaves it.
  if (viewer.preview) redirect(`/a/${slug}`);
  if (!isEditor(viewer)) redirect(`/login?next=/a/${slug}/history`);
  const data = await getArticleForEditing(viewer, slug);
  if (!data) notFound();
  const revisions = await listRevisions(viewer, data.article.id);
  const shown = rev ? await getRevision(viewer, rev) : null;
  const snap = shown?.snapshot as Snapshot | undefined;

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Guide</Link>
          </li>
          <li>
            <Link href={`/a/${slug}`}>{data.article.title}</Link>
          </li>
          <li aria-current="page">History</li>
        </ol>
      </nav>
      <h1 className="page-title">History of {data.article.title}</h1>
      <p className="lede">Every save keeps a full copy of the entry. Restoring a version saves it as a new version, so nothing is lost.</p>

      <div className="article-grid" style={{ marginTop: "2rem" }}>
        <ol className="rev-list">
          {revisions.map((r, i) => (
            <li key={r.id}>
              <span className="rev-when">
                {ACTION[r.action] ?? r.action} {r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                {i === 0 && " (current)"}
              </span>
              <span className="rev-detail">
                {r.by ?? "Unknown"}
                {r.note ? `: ${r.note}` : ""}
              </span>
              <span className="rev-actions">
                <Link className="btn btn-quiet" href={`/a/${slug}/history?rev=${r.id}`} aria-current={rev === r.id ? "true" : undefined}>
                  View
                </Link>
                {i > 0 && <RestoreButton revisionId={r.id} label="Restore" />}
              </span>
            </li>
          ))}
        </ol>
        <aside className="glance" aria-label="Selected version">
          {snap ? (
            <>
              <h2>{snap.article.title}</h2>
              <p className="source-note" style={{ margin: "0 0 0.8rem" }}>
                Version of {shown!.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC. <StatusBadge status={snap.article.status} />{" "}
                {VISIBILITY_INFO[snap.article.visibility as Vis]?.label}
              </p>
              {snap.blocks.map((b, i) => (
                <div key={i} style={{ marginBottom: "0.8rem" }}>
                  <strong>
                    {b.heading ?? "Untitled section"}
                    {b.visibility === "dm" ? " (DM Ledger)" : ""}
                  </strong>
                  <p style={{ margin: "0.2rem 0 0", whiteSpace: "pre-wrap" }}>{docPlainText(b.content as PMNode).slice(0, 600) || "Empty"}</p>
                </div>
              ))}
            </>
          ) : (
            <p className="empty-note">Choose View on any version to read it here.</p>
          )}
        </aside>
      </div>
    </>
  );
}
