import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { search } from "@/lib/queries";
import { TYPE_LABEL, type ArticleType } from "@/lib/vocab";
import { SearchBox } from "@/components/SearchBox";
import { StatusBadge, DmBadge } from "@/components/Badges";
import { isEditor } from "@/lib/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

function Snippet({ text }: { text: string }) {
  // ts_headline marks matches with « »; render them as <mark> without trusting any HTML.
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <p className="result-snippet">
      {parts.map((p, i) => (p.startsWith("«") && p.endsWith("»") ? <mark key={i}>{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}
    </p>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const viewer = await getViewer();
  const results = q.trim() ? await search(viewer, q) : [];
  return (
    <>
      <header className="category-head">
        <h1 className="page-title">Search the guide</h1>
        <div style={{ marginTop: "1rem" }}>
          <SearchBox hero defaultValue={q} autoFocus={!q} />
        </div>
      </header>
      {q.trim() &&
        (results.length ? (
          <>
            <p className="source-note" role="status">
              {results.length} {results.length === 1 ? "entry matches" : "entries match"} “{q}”.
            </p>
            <ol className="result-list">
              {results.map((r) => (
                <li key={r.id}>
                  <Link className="entry-title" href={`/a/${r.slug}`} style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                    {r.title}
                  </Link>
                  <div className="entry-meta">
                    <span>{TYPE_LABEL[r.type as ArticleType] ?? r.type}</span>
                    <StatusBadge status={r.status} />
                    {r.visibility === "dm" && <DmBadge />}
                  </div>
                  <Snippet text={r.snippet} />
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="empty-state" role="status">
            <p>Nothing in the guide matches “{q}”.</p>
            <p>
              Check the spelling, try a shorter word, or browse <Link href="/explore">every entry</Link>.
              {isEditor(viewer) && !viewer.preview && (
                <>
                  {" "}
                  Or <Link href={`/new?title=${encodeURIComponent(q)}`}>start an entry called “{q}”</Link>.
                </>
              )}
            </p>
          </div>
        ))}
    </>
  );
}
