/**
 * The shared inbox: Markdown files in content/inbox/ (usually arriving through
 * GitHub pull requests from Vee or Claude) become PROPOSALS in the site.
 *
 *  - Every file names its author. The author is treated exactly like a collaborator
 *    API key: everything lands as `proposed` + DM-only + signed. Nothing is published,
 *    canonised, overwritten, or deleted. The DM promotes material in the editor.
 *  - If the file's title/slug matches an existing entry, its contents are appended to
 *    that entry as proposals. Otherwise a new (proposed, DM-only) entry is created.
 *  - Each file version is imported once (path + content hash). Editing a file and
 *    importing again adds a new round of proposals; it never rewrites earlier ones.
 *
 * File format: see content/README.md.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { articles, inboxImports } from "@/db/schema";
import type { Viewer } from "./access";
import { isEditor } from "./access";
import { markdownToSections, docToMarkdown } from "./markdown";
import { isEmptyDoc } from "./doc";
import { saveArticle, proposeAdditions, MutationError, slugify } from "./mutations";
import { getWorld } from "./queries";
import { ARTICLE_TYPES, REL_TYPE_KEYS, FRAMINGS, type ArticleType } from "./vocab";

export const INBOX_DIR = () => path.resolve(process.env.INBOX_DIR ?? path.join("content", "inbox"));

export type InboxResult = {
  file: string;
  outcome: "created" | "proposed" | "skipped" | "error";
  slug?: string;
  detail: string;
};

function listInbox(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name.startsWith("_")) continue; // _example.md, .gitkeep
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md") && e.name.toLowerCase() !== "readme.md") out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

type Front = {
  title?: string;
  slug?: string;
  type?: string;
  author?: string;
  summary?: string;
  note?: string;
  source?: string;
  tags?: string[];
  facts?: { label?: string; value?: unknown; source?: string }[];
  connections?: { type?: string; target?: string; note?: string }[];
};

export async function importInbox(editor: Viewer, dir = INBOX_DIR()): Promise<InboxResult[]> {
  if (!isEditor(editor)) throw new MutationError("Only a DM can import the inbox.", 403);
  const db = await getDb();
  const world = await getWorld();
  if (!world) throw new MutationError("No world exists yet.", 500);
  const results: InboxResult[] = [];

  for (const file of listInbox(dir)) {
    const rel = path.relative(dir, file).split(path.sep).join("/");
    try {
      const raw = fs.readFileSync(file, "utf8");
      if (raw.length > 200_000) throw new MutationError("File is larger than 200 KB; split it up.");
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      const [seen] = await db
        .select({ id: inboxImports.id })
        .from(inboxImports)
        .where(and(eq(inboxImports.path, rel), eq(inboxImports.contentHash, hash)))
        .limit(1);
      if (seen) {
        results.push({ file: rel, outcome: "skipped", detail: "Already imported (unchanged)." });
        continue;
      }
      const revised = (await db.select({ id: inboxImports.id }).from(inboxImports).where(eq(inboxImports.path, rel)).limit(1)).length > 0;

      const { data, content } = matter(raw);
      const fm = data as Front;
      const author = String(fm.author ?? "").trim();
      if (!author) throw new MutationError("Add `author:` to the front matter (for example `author: Vee`).");
      const title = String(fm.title ?? "").trim();
      const slugWanted = fm.slug ? String(fm.slug).trim() : title ? slugify(title) : "";
      if (!title && !slugWanted) throw new MutationError("Add `title:` (or `slug:`) to the front matter.");

      // The author acts with collaborator rights only.
      const agent: Viewer = { userId: null, role: "agent", displayName: author.slice(0, 60), preview: false, via: "token" };

      const { h1, sections } = markdownToSections(content);
      const blocks = sections
        .map((s, i) => ({
          heading: s.heading ?? (i === 0 ? h1 : null),
          content: s.doc,
          visibility: "dm" as const,
          status: "proposed" as const,
          framing: "account" as (typeof FRAMINGS)[number],
          source: fm.source ? String(fm.source) : `Inbox file ${rel}`,
        }))
        .filter((b) => !isEmptyDoc(b.content));

      const facts = (fm.facts ?? [])
        .filter((f) => f && f.label)
        .map((f) => ({
          label: String(f.label),
          value: f.value === undefined || f.value === null || f.value === "" ? null : String(f.value),
          visibility: "dm" as const,
          status: "proposed" as const,
          source: f.source ? String(f.source) : null,
        }));

      const warnings: string[] = [];
      const relationships: { type: string; targetId: string; note: string | null; visibility: "dm"; status: "proposed"; source: null }[] = [];
      for (const c of fm.connections ?? []) {
        if (!c?.type || !c?.target) continue;
        if (!(REL_TYPE_KEYS as string[]).includes(String(c.type))) {
          warnings.push(`unknown connection type "${c.type}"`);
          continue;
        }
        const t = String(c.target).trim();
        const [hit] = await db
          .select({ id: articles.id })
          .from(articles)
          .where(and(eq(articles.worldId, world.id), sql`(${articles.slug} = ${slugify(t)} or lower(${articles.title}) = ${t.toLowerCase()})`))
          .limit(1);
        if (!hit) {
          warnings.push(`connection target "${t}" not found`);
          continue;
        }
        relationships.push({ type: String(c.type), targetId: hit.id, note: c.note ? String(c.note) : null, visibility: "dm", status: "proposed", source: null });
      }

      const [existing] = await db
        .select({ id: articles.id, slug: articles.slug })
        .from(articles)
        .where(
          and(
            eq(articles.worldId, world.id),
            sql`(${articles.slug} = ${slugWanted} or (${title} <> '' and lower(${articles.title}) = ${title.toLowerCase()}))`,
          ),
        )
        .limit(1);

      const note = `${revised ? "Revised inbox file" : "Inbox file"} ${rel}${fm.note ? `: ${String(fm.note)}` : ""}`.slice(0, 500);
      let outcome: InboxResult;
      if (existing) {
        if (!blocks.length && !facts.length && !relationships.length) throw new MutationError("Nothing to add: no sections, facts, or connections.");
        const r = await proposeAdditions(agent, existing.slug, { note, blocks, facts, relationships });
        outcome = { file: rel, outcome: "proposed", slug: r.slug, detail: `Added to ${existing.slug}: ${r.added.blocks} section(s), ${r.added.facts} fact(s), ${r.added.relationships} connection(s).` };
        await db.insert(inboxImports).values({ path: rel, contentHash: hash, author, articleId: existing.id, action: "proposed" });
      } else {
        const type = (ARTICLE_TYPES as readonly string[]).includes(String(fm.type)) ? (String(fm.type) as ArticleType) : "note";
        if (fm.type && type === "note" && fm.type !== "note") warnings.push(`unknown type "${fm.type}", saved as a working note`);
        const r = await saveArticle(agent, {
          title: title || slugWanted,
          slug: slugWanted || undefined,
          type,
          status: "proposed",
          visibility: "dm",
          summary: fm.summary ? String(fm.summary) : null,
          source: fm.source ? String(fm.source) : `Inbox file ${rel}`,
          tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
          note,
          blocks,
          facts,
          relationships,
        });
        outcome = { file: rel, outcome: "created", slug: r.slug, detail: `New proposed entry by ${author}.` };
        await db.insert(inboxImports).values({ path: rel, contentHash: hash, author, articleId: r.id, action: "created" });
      }
      if (warnings.length) outcome.detail += ` Warnings: ${warnings.join("; ")}.`;
      results.push(outcome);
    } catch (e) {
      results.push({ file: rel, outcome: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

// ---- Snapshot: the site's current state, written into the repo for collaborators to read ----

const SNAPSHOT_MARK = "generated: uthandar-snapshot";

export const SNAPSHOT_DIR = () => path.resolve(process.env.SNAPSHOT_DIR ?? path.join("content", "world"));

/**
 * Write every entry (including DM-only material) as Markdown into content/world/.
 * Only files this function generated are ever replaced or removed.
 * The repository MUST be private: this folder contains the DM Ledger.
 */
export async function writeSnapshot(editor: Viewer, dir = SNAPSHOT_DIR()) {
  if (!isEditor(editor)) throw new MutationError("Only a DM can write a snapshot.", 403);
  const { buildExport, articleMarkdown } = await import("./export");
  const data = await buildExport({ ...editor, preview: false });
  fs.mkdirSync(dir, { recursive: true });
  const byId = new Map(data.articles.map((a) => [a.id, a]));
  const written = new Set<string>();
  for (const a of data.articles) {
    const name = `${a.slug}.md`;
    fs.writeFileSync(path.join(dir, name), articleMarkdown(a, byId, SNAPSHOT_MARK));
    written.add(name);
  }
  const index = [
    "---",
    SNAPSHOT_MARK,
    `exported: ${data.exportedAt}`,
    "---",
    "",
    `# ${data.world.name}: snapshot of the guide`,
    "",
    "Generated by the site. Do not edit these files; propose changes through content/inbox/ instead.",
    "This folder includes DM-only material. Keep the repository private.",
    "",
    ...data.articles.map((a) => `- [[${a.title}]] (${a.type}, ${a.status}, ${a.visibility === "dm" ? "DM only" : "in the guide"})`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "_index.md"), index);
  written.add("_index.md");
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md") || written.has(f)) continue;
    const head = fs.readFileSync(path.join(dir, f), "utf8").slice(0, 400);
    if (head.includes(SNAPSHOT_MARK)) {
      fs.rmSync(path.join(dir, f));
      removed++;
    }
  }
  return { dir, written: written.size, removed };
}

export { docToMarkdown };
