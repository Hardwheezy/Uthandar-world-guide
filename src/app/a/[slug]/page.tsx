import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/viewer";
import { isEditor, seesDm } from "@/lib/access";
import { getArticleBySlug, getArticleView } from "@/lib/queries";
import { categoryForType, FRAMING_INFO, relLabel, TYPE_LABEL, type ArticleType, type FramingKind } from "@/lib/vocab";
import { sanitizeDocForViewer, type PMNode } from "@/lib/doc";
import { DocRenderer, isEmptyDoc } from "@/components/DocRenderer";
import { StatusBadge, DmBadge, Tbe } from "@/components/Badges";
import { SealIcon } from "@/components/Icons";
import { StoryWeb } from "@/components/StoryWeb";
import { setPreview } from "@/app/actions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = await getArticleBySlug(await getViewer(), slug);
  return { title: a?.title ?? "Not in the guide" };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const viewer = await getViewer();
  const view = await getArticleView(viewer, slug);
  if (!view) notFound();
  const { article, blocks, facts, relationships, linkTargets, backlinks, related, hidden } = view;
  const dm = seesDm(viewer);
  const editor = isEditor(viewer) && !viewer.preview;
  const category = categoryForType(article.type);
  const visibleIds = new Set([...linkTargets.byId.keys(), ...[...linkTargets.byTitle.values()].map((t) => t.id)]);

  const groupedRels = new Map<string, typeof relationships>();
  for (const r of relationships) {
    const label = relLabel(r.type, r.outgoing);
    groupedRels.set(label, [...(groupedRels.get(label) ?? []), r]);
  }
  const hiddenTotal = hidden ? hidden.blocks + hidden.facts + hidden.relationships : 0;

  return (
    <article>
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Guide</Link>
          </li>
          {category ? (
            <li>
              <Link href={`/c/${category.slug}`}>{category.label}</Link>
            </li>
          ) : (
            <li>
              <Link href="/explore">All entries</Link>
            </li>
          )}
          <li aria-current="page">{article.title}</li>
        </ol>
      </nav>

      {dm && (
        <div className="dm-bar" role="region" aria-label="DM tools">
          <span className="dm-bar-note">
            <SealIcon /> DM view.{" "}
            {article.visibility === "dm"
              ? "This whole entry is DM-only. Visitors get “not found”."
              : hiddenTotal
                ? `Visitors don't see ${[
                    hidden!.blocks && `${hidden!.blocks} ${hidden!.blocks === 1 ? "section" : "sections"}`,
                    hidden!.facts && `${hidden!.facts} ${hidden!.facts === 1 ? "fact" : "facts"}`,
                    hidden!.relationships && `${hidden!.relationships} ${hidden!.relationships === 1 ? "connection" : "connections"}`,
                  ]
                    .filter(Boolean)
                    .join(", ")} on this page.`
                : "Everything on this page is public."}
          </span>
          <Link className="btn" href={`/a/${article.slug}/edit`}>
            Edit entry
          </Link>
          <Link className="btn" href={`/a/${article.slug}/history`}>
            History
          </Link>
          {article.visibility === "public" && (
            <form action={setPreview}>
              <input type="hidden" name="preview" value="on" />
              <input type="hidden" name="back" value={`/a/${article.slug}`} />
              <button className="btn" type="submit">
                View as visitor
              </button>
            </form>
          )}
        </div>
      )}

      <header className="article-head">
        <div className="article-kind">
          <span>{TYPE_LABEL[article.type as ArticleType] ?? article.type}</span>
          <StatusBadge status={article.status} />
          {article.visibility === "dm" && <DmBadge />}
        </div>
        <h1 className="page-title">{article.title}</h1>
        <p className="lede">{article.summary ?? <Tbe />}</p>
        {dm && article.source && <p className="source-note">Source: {article.source}</p>}
      </header>

      <div className="article-grid">
        <div>
          {blocks.length === 0 && (
            <div className="empty-state">
              <p>This entry has no text yet.</p>
              {editor && (
                <p>
                  <Link href={`/a/${article.slug}/edit`}>Write the first section</Link>
                </p>
              )}
            </div>
          )}
          {blocks.map((b, i) => {
            const content = sanitizeDocForViewer(b.content as PMNode, visibleIds);
            const empty = isEmptyDoc(content);
            const framing = FRAMING_INFO[b.framing as FramingKind]?.note;
            const showStatus = b.status !== article.status;
            const isLedger = b.visibility === "dm";
            const heading = b.heading ?? (isLedger ? "DM notes" : null);
            const headingId = `s-${i}`;
            return (
              <section key={b.id} className={isLedger ? "ledger" : "section"} aria-labelledby={heading ? headingId : undefined}>
                {isLedger && (
                  <div className="ledger-mark">
                    <SealIcon /> DM Ledger
                  </div>
                )}
                {heading && (
                  <h2 id={headingId}>
                    {heading}
                    {showStatus && <StatusBadge status={b.status} className="section-status" />}
                  </h2>
                )}
                {dm && b.source && <p className={isLedger ? "ledger-source" : "source-note"}>Source: {b.source}</p>}
                {framing && <p className="framing">{framing}</p>}
                <div className="prose">
                  {empty ? (
                    <p>
                      <Tbe />
                    </p>
                  ) : (
                    <DocRenderer doc={content} targets={linkTargets} editor={editor} />
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="glance" aria-labelledby="glance-title">
          <h2 id="glance-title">At a glance</h2>
          {facts.length === 0 && relationships.length === 0 ? (
            <p className="empty-note">No facts recorded yet.</p>
          ) : (
            <dl>
              {facts.map((f) => (
                <div key={f.id} className={f.visibility === "dm" ? "fact-dm" : undefined}>
                  <dt>
                    {f.label}
                    {f.visibility === "dm" && <span className="sr-only"> (DM Ledger)</span>}
                  </dt>
                  <dd>{f.value ?? <Tbe />}</dd>
                </div>
              ))}
            </dl>
          )}
          {relationships.length > 0 && (
            <>
              <hr className="glance-divider" />
              <ul className="rel-list" aria-label="Connections">
                {[...groupedRels.entries()].map(([label, rels]) => (
                  <li key={label}>
                    <span className="rel-type">{label[0].toUpperCase() + label.slice(1)}</span>
                    {rels.map((r) => (
                      <span key={r.id} className={r.visibility === "dm" || r.other.visibility === "dm" ? "fact-dm" : undefined} style={{ display: "block" }}>
                        <Link href={`/a/${r.other.slug}`}>{r.other.title}</Link>
                        {r.status !== "canon" && (
                          <>
                            {" "}
                            <StatusBadge status={r.status} />
                          </>
                        )}
                        {r.note && <span style={{ display: "block", fontSize: "0.85rem" }}>{r.note}</span>}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      <section className="explore" aria-labelledby="explore-title">
        <h2 id="explore-title" className="section-title">
          Explore further
        </h2>
        {/* Keyed by lens: switching to public preview must discard any DM-fetched graph state. */}
        <StoryWeb key={`${article.slug}:${dm ? "dm" : "public"}`} slug={article.slug} dm={dm} />
        <div className="explore-grid">
          <div>
            <h3>Mentioned in</h3>
            {backlinks.length ? (
              <ul className="plain-list">
                {backlinks.map((b) => (
                  <li key={b.id}>
                    <Link href={`/a/${b.slug}`}>{b.title}</Link>
                    <span className="hint">{TYPE_LABEL[b.type as ArticleType] ?? b.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-note">No other entry links here yet.</p>
            )}
          </div>
          <div>
            <h3>Related entries</h3>
            {related.length ? (
              <ul className="plain-list">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/a/${r.slug}`}>{r.title}</Link>
                    <span className="hint">{r.via === "connection" ? "connected nearby" : "similar topic"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-note">Nothing related beyond the connections above.</p>
            )}
          </div>
          {category && (
            <div>
              <h3>Browse</h3>
              <ul className="plain-list">
                <li>
                  <Link href={`/c/${category.slug}`}>More in {category.label}</Link>
                </li>
                <li>
                  <Link href="/explore">Every entry, A to Z</Link>
                </li>
              </ul>
            </div>
          )}
        </div>
      </section>
    </article>
  );
}
