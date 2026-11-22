import { getViewer } from "@/lib/viewer";
import { buildExport, exportToMarkdownZip } from "@/lib/export";

export async function GET(req: Request) {
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const data = await buildExport(await getViewer());
  const stamp = data.exportedAt.slice(0, 10);
  const name = `uthandar-${data.scope}-${stamp}`;
  const common = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (format === "markdown") {
    return new Response(Buffer.from(exportToMarkdownZip(data)), {
      headers: { ...common, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}-markdown.zip"` },
    });
  }
  return new Response(JSON.stringify(data, null, 2), {
    headers: { ...common, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.json"` },
  });
}
