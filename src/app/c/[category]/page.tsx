import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { isEditor } from "@/lib/access";
import { listArticles } from "@/lib/queries";
import { CATEGORIES } from "@/lib/vocab";
import { AZ } from "@/components/EntryList";
import { TEMPLATES } from "@/lib/templates";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: P) {
  const { category } = await params;
  return { title: CATEGORIES.find((c) => c.slug === category)?.label ?? "Not found" };
}

export default async function CategoryPage({ params }: P) {
  const { category } = await params;
  const cat = CATEGORIES.find((c) => c.slug === category);
  if (!cat) notFound();
  const viewer = await getViewer();
  const items = await listArticles(viewer, { types: cat.types });
  const editor = isEditor(viewer) && !viewer.preview;
  const template = TEMPLATES.find((t) => (cat.types as readonly string[]).includes(t.type));
  return (
    <>
      <header className="category-head">
        <nav className="crumbs" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link href="/">Guide</Link>
            </li>
            <li aria-current="page">{cat.label}</li>
          </ol>
        </nav>
        <h1 className="page-title">{cat.label}</h1>
      </header>
      {items.length ? (
        <AZ items={items} />
      ) : (
        <div className="empty-state">
          <p>{cat.empty}</p>
          {editor ? (
            <p>
              <Link href={`/new${template ? `?template=${template.key}` : ""}`}>Write the first one</Link>
            </p>
          ) : (
            <p>
              Try <Link href="/explore">every entry</Link> or search instead.
            </p>
          )}
        </div>
      )}
    </>
  );
}
