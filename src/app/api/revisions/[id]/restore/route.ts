import { getViewer, mutationAllowed } from "@/lib/viewer";
import { restoreRevision } from "@/lib/mutations";
import { json, errorResponse } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await mutationAllowed(req))) return json({ error: "Cross-site request refused." }, 403);
  const { id } = await params;
  try {
    return json(await restoreRevision(await getViewer(), id));
  } catch (e) {
    return errorResponse(e);
  }
}
