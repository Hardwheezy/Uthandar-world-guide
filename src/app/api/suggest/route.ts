import { getViewer } from "@/lib/viewer";
import { suggest } from "@/lib/queries";
import { json } from "@/lib/http";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
  return json({ results: await suggest(await getViewer(), q) });
}
