import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { isEditor } from "@/lib/access";
import { getTemplate } from "@/lib/templates";
import { emptyDoc } from "@/lib/doc";
import { ArticleEditor, type EditorInitial } from "@/components/editor/ArticleEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "New entry" };

export default async function NewPage({ searchParams }: { searchParams: Promise<{ title?: string; template?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  if (viewer.preview) redirect("/");
  if (!isEditor(viewer)) redirect(`/login?next=/new`);
  const t = getTemplate(sp.template) ?? getTemplate("freeform")!;
  let n = 0;
  const initial: EditorInitial = {
    id: null,
    updatedAt: null,
    title: (sp.title ?? "").slice(0, 200),
    slug: "",
    type: t.type,
    summary: "",
    status: "draft",
    visibility: "dm", // new entries start private; publish deliberately
    template: t.key,
    tags: "",
    source: "",
    blocks: t.sections.map((s) => ({ key: `n${n++}`, heading: s.heading, content: emptyDoc(), visibility: s.visibility, status: "draft", framing: "account", source: "" })),
    facts: t.facts.map((f) => ({ key: `n${n++}`, label: f.label, value: "", visibility: f.visibility, status: "draft", source: "" })),
    relationships: [],
    incoming: [],
  };
  return <ArticleEditor initial={initial} />;
}
