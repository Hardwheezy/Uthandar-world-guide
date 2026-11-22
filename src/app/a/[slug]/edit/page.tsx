import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { isEditor } from "@/lib/access";
import { getArticleForEditing } from "@/lib/queries";
import { relLabel, type ArticleType, type FramingKind, type RelType, type Status, type Vis } from "@/lib/vocab";
import { ArticleEditor, type EditorInitial } from "@/components/editor/ArticleEditor";
import type { PMDoc } from "@/lib/doc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit entry" };

export default async function EditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  // Public preview is a promise: nothing DM-only renders until the DM leaves it.
  if (viewer.preview) redirect(`/a/${slug}`);
  if (!isEditor(viewer)) redirect(`/login?next=/a/${slug}/edit`);
  const d = await getArticleForEditing(viewer, slug);
  if (!d) notFound();
  const initial: EditorInitial = {
    id: d.article.id,
    updatedAt: d.article.updatedAt.toISOString(),
    title: d.article.title,
    slug: d.article.slug,
    type: d.article.type as ArticleType,
    summary: d.article.summary ?? "",
    status: d.article.status as Status,
    visibility: d.article.visibility as Vis,
    template: d.article.template,
    tags: d.article.tags.join(", "),
    source: d.article.source ?? "",
    blocks: d.blocks.map((b) => ({
      key: b.id,
      heading: b.heading ?? "",
      content: b.content as PMDoc,
      visibility: b.visibility as Vis,
      status: b.status as Status,
      framing: b.framing as FramingKind,
      source: b.source ?? "",
    })),
    facts: d.facts.map((f) => ({ key: f.id, label: f.label, value: f.value ?? "", visibility: f.visibility as Vis, status: f.status as Status, source: f.source ?? "" })),
    relationships: d.outgoing.map((r) => ({
      key: r.id,
      type: r.type as RelType,
      targetId: r.targetId,
      targetTitle: r.targetTitle,
      note: r.note ?? "",
      visibility: r.visibility as Vis,
      status: r.status as Status,
      source: r.source ?? "",
    })),
    incoming: d.incoming.map((r) => ({ id: r.id, label: relLabel(r.type, true), title: r.other.title, slug: r.other.slug })),
  };
  return <ArticleEditor initial={initial} />;
}
