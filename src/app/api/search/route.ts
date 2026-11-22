import { getViewer } from "@/lib/viewer";
import { search } from "@/lib/queries";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 200);
  return json({ query: q, results: await search(await getViewer(), q) });
}
