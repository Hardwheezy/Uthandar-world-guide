import { getViewer, mutationAllowed } from "@/lib/viewer";
import { listArticles } from "@/lib/queries";
import { saveArticle } from "@/lib/mutations";
import { json, errorResponse } from "@/lib/http";

/** List entries the viewer may see. */
export async function GET() {
  return json({ results: await listArticles(await getViewer()) });
}

/** Create an entry (editors only). */
export async function POST(req: Request) {
  if (!(await mutationAllowed(req))) return json({ error: "Cross-site request refused." }, 403);
  try {
    const body = await req.json();
    delete body.id;
    return json(await saveArticle(await getViewer(), body), 201);
  } catch (e) {
    return errorResponse(e);
  }
}
