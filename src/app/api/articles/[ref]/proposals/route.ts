import { getViewer, mutationAllowed } from "@/lib/viewer";
import { proposeAdditions } from "@/lib/mutations";
import { json, errorResponse } from "@/lib/http";

/** Append sections / facts / connections to an entry. Collaborator keys: always proposed + DM-only. */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await mutationAllowed(req))) return json({ error: "Cross-site request refused." }, 403);
  const { ref } = await params;
  try {
    return json(await proposeAdditions(await getViewer(), ref, await req.json()), 201);
  } catch (e) {
    return errorResponse(e);
  }
}
