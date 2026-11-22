/**
 * Import the Markdown starter wiki (Obsidian-style vault) as DM-only working notes.
 *
 *  - Every note is imported as visibility = dm, and every section as dm. Nothing is published.
 *  - Editorial status comes from each note's frontmatter (research stays research).
 *  - [[Links]] resolve by FILENAME stem, as Obsidian does, then point at the note's real title.
 *  - Literal "\n" sequences in the source (a known defect in "00 - Start Here.md") become line breaks.
 *  - Only .md files are read. The raw transcript archive is intentionally not imported.
 *  - Re-running skips notes that already exist (by slug), so it is safe to repeat.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { eq } from "drizzle-orm";
import type { DB } from "./client";
import { articles, users } from "./schema";
import { markdownToSections } from "@/lib/markdown";
import { mapDoc, type PMNode, type WikiLinkAttrs } from "@/lib/doc";
import { saveArticle, slugify } from "@/lib/mutations";
import { STATUSES, type ArticleType, type Status } from "@/lib/vocab";
import type { Viewer } from "@/lib/access";

function walkMd(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walkMd(p);
    return e.name.toLowerCase().endsWith(".md") ? [p] : [];
  });
}

function typeFor(rel: string): ArticleType {
  const top = rel.split(path.sep)[0] ?? "";
  if (top.startsWith("02")) return "culture";
  if (top.startsWith("03")) return "faith";
  if (top.startsWith("04")) return "history";
  return "note";
}

export async function importStarter(db: DB, dir: string, log: (s: string) => void = console.log) {
  if (!fs.existsSync(dir)) throw new Error(`Starter folder not found: ${dir}`);
  const [editor] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (!editor) throw new Error("Run the seed first: no admin account exists.");
  const v: Viewer = { userId: editor.id, role: "admin", displayName: editor.displayName, preview: false };

  const files = walkMd(dir).sort();
  const notes = files.map((file) => {
    const rel = path.relative(dir, file);
    const raw = fs.readFileSync(file, "utf8");
    const { data, content } = matter(raw);
    const stem = path.basename(file, ".md");
    const title = String(data.title ?? stem).trim();
    return { file, rel, stem, title, data, content: content.replace(/\\n/g, "\n") };
  });
  const titleByStem = new Map(notes.map((n) => [n.stem.toLowerCase(), n.title]));
  const existing = new Set((await db.select({ slug: articles.slug }).from(articles)).map((r) => r.slug));

  let imported = 0;
  for (const n of notes) {
    const slug = slugify(n.stem);
    if (existing.has(slug)) {
      log(`  skip  ${n.rel} (already imported)`);
      continue;
    }
    const { h1, sections } = markdownToSections(n.content);
    const fixLinks = (doc: PMNode) =>
      mapDoc(doc, (node) => {
        if (node.type !== "wikiLink") return node;
        const a = node.attrs as WikiLinkAttrs;
        const real = titleByStem.get(a.title.toLowerCase());
        return real ? { ...node, attrs: { ...a, title: real, label: a.label ?? (real !== a.title ? a.title : null) } } : node;
      });
    const status: Status = (STATUSES as readonly string[]).includes(String(n.data.status)) ? (n.data.status as Status) : "draft";
    const tags = Array.isArray(n.data.tags) ? n.data.tags.map(String) : [];
    await saveArticle(
      v,
      {
        slug,
        title: n.title,
        type: typeFor(n.rel),
        status,
        visibility: "dm",
        summary: null,
        tags: [...new Set(["starter-wiki", ...tags.map((t: string) => t.toLowerCase())])],
        source: `${n.data.source ? String(n.data.source) + ". " : ""}Imported from starter wiki: ${n.rel.split(path.sep).join("/")}`,
        facts: [],
        blocks: sections.map((s, i) => ({
          heading: s.heading ?? (i === 0 && h1 && h1 !== n.title ? h1 : null),
          content: fixLinks(s.doc),
          visibility: "dm",
          status,
          framing: "account",
          source: null,
        })),
        relationships: [],
        note: `Imported from ${n.rel}`,
      },
      { action: "import" },
    );
    imported++;
    log(`  import ${n.rel} → /a/${slug} [${status}, DM-only]`);
  }
  return { imported, total: notes.length };
}
