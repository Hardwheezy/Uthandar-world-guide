/**
 * Portable exports. Filtered by the same Viewer rules as every other read:
 * visitors get the public guide only; editors get everything.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { zipSync, strToU8 } from "fflate";
import { getDb } from "@/db/client";
import { articles, articleBlocks, articleFacts, relationships } from "@/db/schema";
import { seesDm, visibleTo, type Viewer } from "./access";
import { and } from "drizzle-orm";
import { docToMarkdown } from "./markdown";
import type { PMNode, WikiLinkAttrs } from "./doc";
import { getWorld } from "./queries";

export async function buildExport(v: Viewer) {
  const db = await getDb();
  const world = await getWorld();
  if (!world) throw new Error("No world");
  const arts = await db
    .select()
    .from(articles)
    .where(and(eq(articles.worldId, world.id), visibleTo(v, articles.visibility)))
    .orderBy(asc(articles.title));
  const ids = arts.map((a) => a.id);
  const idSet = new Set(ids);
  const blocks = ids.length
    ? await db.select().from(articleBlocks).where(and(inArray(articleBlocks.articleId, ids), visibleTo(v, articleBlocks.visibility))).orderBy(asc(articleBlocks.position))
    : [];
  const facts = ids.length
    ? await db.select().from(articleFacts).where(and(inArray(articleFacts.articleId, ids), visibleTo(v, articleFacts.visibility))).orderBy(asc(articleFacts.position))
    : [];
  const rels = ids.length
    ? (await db.select().from(relationships).where(and(inArray(relationships.sourceId, ids), visibleTo(v, relationships.visibility)))).filter(
        (r) => idSet.has(r.targetId),
      )
    : [];
  const visibleIds = idSet;
  const scrub = (doc: unknown): unknown => {
    // Strip ids of link targets the viewer can't see (same rule as rendering).
    const rec = (n: PMNode): PMNode => {
      if (n.type === "wikiLink") {
        const a = n.attrs as WikiLinkAttrs;
        if (a.id && !visibleIds.has(a.id)) return { ...n, attrs: { id: null, title: a.label || a.title, label: null } };
      }
      return n.content ? { ...n, content: n.content.map(rec) } : n;
    };
    return rec(doc as PMNode);
  };
  const dm = seesDm(v);
  const meta = <T,>(x: T): T | null => (dm ? x : null);
  return {
    format: "uthandar-guild-guide-export",
    version: 1,
    scope: seesDm(v) ? "full" : "public",
    exportedAt: new Date().toISOString(),
    world: { slug: world.slug, name: world.name, tagline: world.tagline },
    articles: arts.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      type: a.type,
      summary: a.summary,
      status: a.status,
      visibility: a.visibility,
      template: a.template,
      tags: dm ? a.tags : [],
      source: meta(a.source),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      blocks: blocks
        .filter((b) => b.articleId === a.id)
        .map((b) => ({ heading: b.heading, visibility: b.visibility, status: b.status, framing: b.framing, source: meta(b.source), content: scrub(b.content) })),
      facts: facts.filter((f) => f.articleId === a.id).map((f) => ({ label: f.label, value: f.value, visibility: f.visibility, status: f.status, source: meta(f.source) })),
      relationships: rels
        .filter((r) => r.sourceId === a.id)
        .map((r) => ({ type: r.type, targetId: r.targetId, note: r.note, visibility: r.visibility, status: r.status, source: meta(r.source) })),
    })),
  };
}

export type ExportData = Awaited<ReturnType<typeof buildExport>>;

function yamlStr(s: string | null | undefined) {
  if (s === null || s === undefined) return "null";
  return JSON.stringify(s);
}

type ExportArticle = ExportData["articles"][number];

/** One entry as Markdown with front matter (Obsidian-compatible [[links]]). */
export function articleMarkdown(a: ExportArticle, byId: Map<string, ExportArticle>, marker?: string): string {
  const resolve = (l: WikiLinkAttrs) => (l.id && byId.get(l.id)?.title) || (l.id ? null : l.title);
  const lines: string[] = [
    "---",
    ...(marker ? [marker] : []),
    `title: ${yamlStr(a.title)}`,
    `slug: ${yamlStr(a.slug)}`,
    `type: ${a.type}`,
    `status: ${a.status}`,
    `visibility: ${a.visibility}`,
    `tags: [${a.tags.map((t) => JSON.stringify(t)).join(", ")}]`,
    `source: ${yamlStr(a.source)}`,
    `updated: ${a.updatedAt}`,
    "---",
    "",
    `# ${a.title}`,
    "",
    `> ${a.summary ?? "To be established."}`,
    "",
  ];
  if (a.facts.length) {
    lines.push("## At a glance", "");
    for (const f of a.facts) {
      const tag = f.visibility === "dm" ? " *(DM Ledger)*" : "";
      lines.push(`- **${f.label}:** ${f.value ?? "*To be established*"}${tag} <!-- status: ${f.status} -->`);
    }
    lines.push("");
  }
  for (const b of a.blocks) {
    const heading = b.heading ?? (b.visibility === "dm" ? "DM notes" : "Entry");
    lines.push(`## ${heading}${b.visibility === "dm" ? " (DM Ledger)" : ""}`);
    lines.push(`<!-- visibility: ${b.visibility}; status: ${b.status}; framing: ${b.framing}${b.source ? `; source: ${b.source.replace(/-->/g, "")}` : ""} -->`, "");
    lines.push(docToMarkdown(b.content as PMNode, resolve) || "*To be established.*", "");
  }
  if (a.relationships.length) {
    lines.push("## Relationships", "");
    for (const r of a.relationships) {
      const t = byId.get(r.targetId);
      if (!t) continue;
      lines.push(`- ${r.type.replace(/_/g, " ")} [[${t.title}]]${r.visibility === "dm" ? " *(DM Ledger)*" : ""} <!-- status: ${r.status} -->`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function exportToMarkdownZip(data: ExportData): Uint8Array {
  const byId = new Map(data.articles.map((a) => [a.id, a]));
  const files: Record<string, Uint8Array> = {};
  for (const a of data.articles) files[`${a.slug}.md`] = strToU8(articleMarkdown(a, byId));
  files["export.json"] = strToU8(JSON.stringify(data, null, 2));
  return zipSync(files, { level: 6 });
}
