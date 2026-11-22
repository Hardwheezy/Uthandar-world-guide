import { getViewer, mutationAllowed } from "@/lib/viewer";
import { getArticleView } from "@/lib/queries";
import { saveArticle, deleteArticle } from "@/lib/mutations";
import { sanitizeDocForViewer, type PMNode } from "@/lib/doc";
import { json, errorResponse } from "@/lib/http";
import { docToMarkdown } from "@/lib/markdown";

type Ctx = { params: Promise<{ ref: string }> };

/** Read one entry by slug, filtered exactly like the page. */
export async function GET(req: Request, { params }: Ctx) {
  const { ref } = await params;
  const asMarkdown = new URL(req.url).searchParams.get("format") === "markdown";
  const view = await getArticleView(await getViewer(), ref);
  if (!view) return json({ error: "Not found" }, 404);
  const ids = new Set([...view.linkTargets.byId.keys(), ...[...view.linkTargets.byTitle.values()].map((t) => t.id)]);
  const titleOf = (id: string) => view.linkTargets.byId.get(id)?.title ?? [...view.linkTargets.byTitle.values()].find((t) => t.id === id)?.title ?? null;
  return json({
    article: view.article,
    blocks: view.blocks.map((b) => {
      const content = sanitizeDocForViewer(b.content as PMNode, ids);
      return asMarkdown
        ? { ...b, content: undefined, markdown: docToMarkdown(content, (l) => (l.id ? titleOf(l.id) : l.title)) }
        : { ...b, content };
    }),
    facts: view.facts,
    relationships: view.relationships,
    backlinks: view.backlinks,
    related: view.related,
  });
}

/** Save an existing entry by id (editors only). */
export async function PUT(req: Request, { params }: Ctx) {
  if (!(await mutationAllowed(req))) return json({ error: "Cross-site request refused." }, 403);
  const { ref } = await params;
  try {
    const body = await req.json();
    return json(await saveArticle(await getViewer(), { ...body, id: ref }));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await mutationAllowed(req))) return json({ error: "Cross-site request refused." }, 403);
  const { ref } = await params;
  try {
    return json(await deleteArticle(await getViewer(), ref));
  } catch (e) {
    return errorResponse(e);
  }
}
