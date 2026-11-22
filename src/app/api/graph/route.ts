import { getViewer } from "@/lib/viewer";
import { getNeighbourhood } from "@/lib/queries";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const g = await getNeighbourhood(await getViewer(), slug);
  if (!g) return json({ error: "Not found" }, 404);
  return json(g);
}
