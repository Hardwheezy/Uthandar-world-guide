/**
 * All writes. Every mutation requires an editor account, runs in a transaction,
 * rebuilds the wiki-link index, and records a full-article revision snapshot.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "@/db/client";
import { articles, articleBlocks, articleFacts, articleLinks, relationships, revisions, type Article } from "@/db/schema";
import { canPropose, isEditor, type Viewer } from "./access";
import { markdownToDoc } from "./markdown";
import { docPlainText, extractWikiLinks, isDoc, LIMITS, mapDoc, safeHref, type PMNode, type WikiLinkAttrs } from "./doc";
export { safeHref };
import { ARTICLE_TYPES, FRAMINGS, REL_TYPE_KEYS, STATUSES, VISIBILITIES } from "./vocab";
import { getWorld } from "./queries";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Exec = DB | Tx;

export class MutationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const status = z.enum(STATUSES);
const vis = z.enum(VISIBILITIES);
const nullableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((s) => (s && s.trim() ? s.trim() : null));

export const ArticleInput = z.object({
  id: z.string().uuid().optional(),
  baseUpdatedAt: z.string().optional(),
  title: z.string().trim().min(1, "Give the entry a title.").max(LIMITS.title),
  slug: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  type: z.enum(ARTICLE_TYPES),
  summary: nullableText(LIMITS.summary),
  status,
  visibility: vis,
  template: z.string().max(40).nullish(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30).default([]),
  source: nullableText(LIMITS.source),
  note: z.string().max(500).optional(),
  blocks: z
    .array(
      z.object({
        heading: nullableText(LIMITS.heading),
        /** Tiptap/ProseMirror JSON… */
        content: z.unknown().optional(),
        /** …or Markdown with [[wiki links]] (handy for API clients). */
        markdown: z.string().max(100_000).optional(),
        visibility: vis,
        status,
        framing: z.enum(FRAMINGS).default("account"),
        source: nullableText(LIMITS.source),
      }),
    )
    .max(LIMITS.blocks),
  facts: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(LIMITS.factLabel),
        value: nullableText(LIMITS.factValue),
        visibility: vis,
        status,
        source: nullableText(LIMITS.source),
      }),
    )
    .max(LIMITS.facts),
  relationships: z
    .array(
      z.object({
        type: z.enum(REL_TYPE_KEYS as [string, ...string[]]),
        targetId: z.string().uuid(),
        note: nullableText(1000),
        visibility: vis,
        status,
        source: nullableText(LIMITS.source),
      }),
    )
    .max(LIMITS.relationships),
});
export type ArticleInputT = z.input<typeof ArticleInput>;

const BlockInput = ArticleInput.shape.blocks.element;
const FactInput = ArticleInput.shape.facts.element;
const RelInput = ArticleInput.shape.relationships.element;

export const ProposalInput = z.object({
  note: z.string().max(500).optional(),
  blocks: z.array(BlockInput).max(20).default([]),
  facts: z.array(FactInput).max(30).default([]),
  relationships: z.array(RelInput).max(30).default([]),
});

export function slugify(s: string) {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[—–]/g, "-")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "entry"
  );
}

const ALLOWED_NODES = new Set([
  "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote",
  "codeBlock", "horizontalRule", "hardBreak", "wikiLink", "table", "tableRow", "tableHeader", "tableCell",
]);
const ALLOWED_MARKS = new Set(["bold", "italic", "strike", "code", "link", "underline"]);


/** Drop unknown nodes/marks, unsafe hrefs, and wiki-link ids that aren't real articles in this world. */
function cleanDoc(raw: unknown, validIds: Set<string>, idByTitle: Map<string, string> = new Map()): PMNode {
  if (!isDoc(raw)) return { type: "doc", content: [{ type: "paragraph" }] };
  if (JSON.stringify(raw).length > LIMITS.docBytes) throw new MutationError("A section is too long to save.");
  const strip = (n: PMNode): PMNode | null => {
    if (!ALLOWED_NODES.has(n.type)) return null;
    const out: PMNode = { type: n.type };
    if (n.type === "text") {
      out.text = String(n.text ?? "");
      const marks = (n.marks ?? [])
        .filter((m) => ALLOWED_MARKS.has(m.type))
        .map((m) => (m.type === "link" ? { type: "link", attrs: { href: safeHref(m.attrs?.href) } } : { type: m.type }))
        .filter((m) => m.type !== "link" || m.attrs?.href);
      if (marks.length) out.marks = marks;
      return out.text ? out : null;
    }
    if (n.type === "heading") out.attrs = { level: Math.min(Math.max(Number(n.attrs?.level) || 3, 2), 4) };
    if (n.type === "wikiLink") {
      const a = (n.attrs ?? {}) as Partial<WikiLinkAttrs>;
      const title = String(a.title ?? "").slice(0, LIMITS.title).trim();
      if (!title) return null;
      // Keep a valid target; otherwise resolve a typed [[Title]] to the entry with that exact title.
      const id = a.id && validIds.has(String(a.id)) ? String(a.id) : (idByTitle.get(title.toLowerCase()) ?? null);
      out.attrs = { id, title, label: a.label ? String(a.label).slice(0, LIMITS.title) : null };
      return out;
    }
    if (n.type === "tableCell" || n.type === "tableHeader") out.attrs = { colspan: 1, rowspan: 1, colwidth: null };
    if (n.content) out.content = n.content.map(strip).filter((c): c is PMNode => !!c);
    return out;
  };
  return strip(raw as PMNode) ?? { type: "doc", content: [{ type: "paragraph" }] };
}

async function uniqueSlug(tx: Exec, worldId: string, base: string, exceptId?: string) {
  let slug = base;
  for (let i = 2; i < 500; i++) {
    const [hit] = await tx
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.worldId, worldId), eq(articles.slug, slug)))
      .limit(1);
    if (!hit || hit.id === exceptId) return slug;
    slug = `${base}-${i}`;
  }
  throw new MutationError("Could not find a free address for this entry.");
}

export type Snapshot = {
  article: Omit<Article, "createdAt" | "updatedAt" | "createdBy" | "updatedBy"> & { createdAt?: string; updatedAt?: string };
  blocks: { heading: string | null; content: unknown; visibility: string; status: string; framing: string; source: string | null }[];
  facts: { label: string; value: string | null; visibility: string; status: string; source: string | null }[];
  relationships: { type: string; targetId: string; note: string | null; visibility: string; status: string; source: string | null }[];
  incoming?: { type: string; sourceId: string; note: string | null; visibility: string; status: string; source: string | null }[];
};

export async function snapshotArticle(tx: Exec, articleId: string, withIncoming = false): Promise<Snapshot | null> {
  const [a] = await tx.select().from(articles).where(eq(articles.id, articleId)).limit(1);
  if (!a) return null;
  const blocks = await tx.select().from(articleBlocks).where(eq(articleBlocks.articleId, articleId)).orderBy(articleBlocks.position);
  const facts = await tx.select().from(articleFacts).where(eq(articleFacts.articleId, articleId)).orderBy(articleFacts.position);
  const rels = await tx.select().from(relationships).where(eq(relationships.sourceId, articleId));
  const snap: Snapshot = {
    article: {
      id: a.id, worldId: a.worldId, slug: a.slug, title: a.title, type: a.type, summary: a.summary,
      status: a.status, visibility: a.visibility, template: a.template, tags: a.tags, source: a.source,
      createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
    },
    blocks: blocks.map((b) => ({ heading: b.heading, content: b.content, visibility: b.visibility, status: b.status, framing: b.framing, source: b.source })),
    facts: facts.map((f) => ({ label: f.label, value: f.value, visibility: f.visibility, status: f.status, source: f.source })),
    relationships: rels.map((r) => ({ type: r.type, targetId: r.targetId, note: r.note, visibility: r.visibility, status: r.status, source: r.source })),
  };
  if (withIncoming) {
    const inc = await tx.select().from(relationships).where(eq(relationships.targetId, articleId));
    snap.incoming = inc.map((r) => ({ type: r.type, sourceId: r.sourceId, note: r.note, visibility: r.visibility, status: r.status, source: r.source }));
  }
  return snap;
}

/** Rebuild article_links for one article, and adopt dangling links that name it. */
async function rebuildLinks(tx: Exec, article: { id: string; worldId: string; title: string }) {
  await tx.delete(articleLinks).where(eq(articleLinks.sourceArticleId, article.id));
  const blocks = await tx.select({ id: articleBlocks.id, content: articleBlocks.content }).from(articleBlocks).where(eq(articleBlocks.articleId, article.id));
  const pending: { blockId: string; link: WikiLinkAttrs }[] = [];
  for (const b of blocks) for (const link of extractWikiLinks(b.content as PMNode)) pending.push({ blockId: b.id, link });
  const titles = [...new Set(pending.filter((p) => !p.link.id).map((p) => p.link.title.toLowerCase()))];
  const byTitle = new Map<string, string>();
  if (titles.length) {
    const hits = await tx
      .select({ id: articles.id, title: articles.title })
      .from(articles)
      .where(and(eq(articles.worldId, article.worldId), inArray(sql`lower(${articles.title})`, titles)));
    hits.forEach((h) => byTitle.set(h.title.toLowerCase(), h.id));
  }
  if (pending.length) {
    await tx.insert(articleLinks).values(
      pending.map((p) => ({
        blockId: p.blockId,
        sourceArticleId: article.id,
        targetArticleId: p.link.id ?? byTitle.get(p.link.title.toLowerCase()) ?? null,
        targetTitle: p.link.title,
      })),
    );
  }
  // Links elsewhere that were waiting for a page with this title now resolve to it.
  await tx
    .update(articleLinks)
    .set({ targetArticleId: article.id })
    .where(and(sql`${articleLinks.targetArticleId} is null`, sql`lower(${articleLinks.targetTitle}) = ${article.title.toLowerCase()}`));
}

/**
 * Replace an entry's sections, facts, and outgoing connections.
 * `resolveFrom`: sections at or after this index get typed [[Title]] links resolved to ids.
 * Earlier sections are written back exactly as they were (proposals and restores must not
 * alter existing material, not even link ids).
 */
async function writeChildren(tx: Exec, articleId: string, worldId: string, input: z.output<typeof ArticleInput>, resolveFrom = 0) {
  const all = await tx.select({ id: articles.id, title: articles.title }).from(articles).where(eq(articles.worldId, worldId));
  const ids = new Set(all.map((r) => r.id));
  const idByTitle = new Map(all.map((r) => [r.title.toLowerCase(), r.id]));
  await tx.delete(articleBlocks).where(eq(articleBlocks.articleId, articleId));
  await tx.delete(articleFacts).where(eq(articleFacts.articleId, articleId));
  await tx.delete(relationships).where(eq(relationships.sourceId, articleId));
  if (input.blocks.length) {
    await tx.insert(articleBlocks).values(
      input.blocks.map((b, i) => {
        const content = cleanDoc(b.markdown !== undefined ? markdownToDoc(b.markdown) : b.content, ids, i >= resolveFrom ? idByTitle : undefined);
        return {
          articleId,
          position: i,
          heading: b.heading,
          content,
          plainText: docPlainText(content),
          visibility: b.visibility,
          status: b.status,
          framing: b.framing,
          source: b.source,
        };
      }),
    );
  }
  if (input.facts.length) {
    await tx.insert(articleFacts).values(input.facts.map((f, i) => ({ articleId, position: i, ...f })));
  }
  const rels = input.relationships.filter((r) => ids.has(r.targetId) && r.targetId !== articleId);
  if (rels.length) await tx.insert(relationships).values(rels.map((r) => ({ worldId, sourceId: articleId, ...r })));
}

/** Warnings an editor should see after saving (nothing is blocked). */
async function publicationWarnings(tx: Exec, articleId: string) {
  const warnings: string[] = [];
  const leaks = (await tx.execute(sql`
    select distinct t.title from article_links l
    join article_blocks b on b.id = l.block_id
    join articles s on s.id = l.source_article_id
    join articles t on t.id = l.target_article_id
    where l.source_article_id = ${articleId} and b.visibility = 'public' and s.visibility = 'public' and t.visibility = 'dm'`)) as unknown as {
    rows: { title: string }[];
  };
  for (const r of leaks.rows)
    warnings.push(`A guide section links to "${r.title}", which is DM-only. Visitors see the link text as plain words, but the words themselves are public.`);
  return warnings;
}

function signed(v: Viewer, source: string | null) {
  const by = `Proposed by ${v.displayName ?? "a collaborator"} via API`;
  return source ? `${by}. ${source}` : by;
}

/**
 * Collaborator keys never decide canon or publication: everything they write is
 * `proposed`, DM-only, and signed with the key's name. The DM promotes it later.
 */
function guardAgentWrite<T extends { visibility: string; status: string; source?: string | null }>(v: Viewer, item: T): T {
  if (v.role !== "agent") return item;
  return { ...item, visibility: "dm", status: "proposed", source: signed(v, item.source ?? null) };
}

function issues(e: z.ZodError) {
  return e.issues.map((i) => `${i.path.join(".") || "entry"}: ${i.message}`).join("; ");
}

export async function saveArticle(v: Viewer, raw: unknown, opts: { action?: string } = {}) {
  if (!canPropose(v)) throw new MutationError("Sign in as a DM or editor to save entries.", 403);
  const parsed = ArticleInput.safeParse(raw);
  if (!parsed.success) throw new MutationError(issues(parsed.error));
  let input = parsed.data;
  if (v.role === "agent") {
    if (input.id) throw new MutationError("Collaborator keys can't overwrite entries. Send additions to /api/articles/{slug}/proposals instead.", 403);
    input = {
      ...guardAgentWrite(v, input),
      blocks: input.blocks.map((b) => guardAgentWrite(v, b)),
      facts: input.facts.map((f) => guardAgentWrite(v, f)),
      relationships: input.relationships.map((r) => guardAgentWrite(v, r)),
    };
  }
  const world = await getWorld();
  if (!world) throw new MutationError("No world exists yet. Run the setup script.", 500);
  const db = await getDb();

  return db.transaction(async (tx) => {
    let articleId = input.id;
    let action: "create" | "update" = "create";
    if (articleId) {
      const [existing] = await tx.select().from(articles).where(and(eq(articles.id, articleId), eq(articles.worldId, world.id))).limit(1);
      if (!existing) throw new MutationError("That entry no longer exists.", 404);
      if (input.baseUpdatedAt && new Date(input.baseUpdatedAt).getTime() < existing.updatedAt.getTime() - 1) {
        throw new MutationError("Someone saved this entry after you opened it. Reload to see their changes before saving.", 409);
      }
      action = "update";
      const slug = await uniqueSlug(tx, world.id, input.slug ?? existing.slug, articleId);
      await tx
        .update(articles)
        .set({
          slug, title: input.title, type: input.type, summary: input.summary, status: input.status,
          visibility: input.visibility, template: input.template ?? null, tags: input.tags, source: input.source,
          updatedBy: v.userId, updatedAt: new Date(),
        })
        .where(eq(articles.id, articleId));
    } else {
      const slug = await uniqueSlug(tx, world.id, input.slug ?? slugify(input.title));
      const [created] = await tx
        .insert(articles)
        .values({
          worldId: world.id, slug, title: input.title, type: input.type, summary: input.summary, status: input.status,
          visibility: input.visibility, template: input.template ?? null, tags: input.tags, source: input.source,
          createdBy: v.userId, updatedBy: v.userId,
        })
        .returning({ id: articles.id });
      articleId = created.id;
    }
    await writeChildren(tx, articleId!, world.id, input);
    await rebuildLinks(tx, { id: articleId!, worldId: world.id, title: input.title });
    const snap = await snapshotArticle(tx, articleId!);
    await tx.insert(revisions).values({
      articleId: articleId!, worldId: world.id, action: opts.action ?? action, title: input.title, snapshot: snap!, note: input.note ?? null, createdBy: v.userId, actor: v.displayName,
    });
    const warnings = await publicationWarnings(tx, articleId!);
    const [saved] = await tx.select({ slug: articles.slug, updatedAt: articles.updatedAt }).from(articles).where(eq(articles.id, articleId!));
    return { id: articleId!, slug: saved.slug, updatedAt: saved.updatedAt.toISOString(), warnings, action };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteArticle(v: Viewer, articleId: string) {
  if (!isEditor(v)) throw new MutationError("Sign in as a DM or editor to delete entries.", 403);
  if (!UUID.test(articleId)) throw new MutationError("That entry no longer exists.", 404);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const snap = await snapshotArticle(tx, articleId, true);
    if (!snap) throw new MutationError("That entry no longer exists.", 404);
    await tx.insert(revisions).values({
      articleId, worldId: snap.article.worldId, action: "delete", title: snap.article.title, snapshot: snap, createdBy: v.userId, actor: v.displayName,
      note: "Deleted. Restore from the DM Ledger.",
    });
    await tx.delete(articles).where(eq(articles.id, articleId));
    return { ok: true };
  });
}

/** Write a snapshot back. Recreates the article if it was deleted. */
export async function applySnapshot(tx: Exec, snap: Snapshot, userId: string | null, action: string, note: string | null, actor: string | null = null) {
  const a = snap.article;
  const [existing] = await tx.select({ id: articles.id }).from(articles).where(eq(articles.id, a.id)).limit(1);
  const slug = await uniqueSlug(tx, a.worldId, a.slug, a.id);
  const fields = {
    slug, title: a.title, type: a.type, summary: a.summary, status: a.status, visibility: a.visibility,
    template: a.template, tags: a.tags ?? [], source: a.source, updatedBy: userId, updatedAt: new Date(),
  };
  if (existing) await tx.update(articles).set(fields).where(eq(articles.id, a.id));
  else await tx.insert(articles).values({ id: a.id, worldId: a.worldId, createdBy: userId, ...fields });

  const input = ArticleInput.parse({
    title: a.title, type: a.type, status: a.status, visibility: a.visibility, summary: a.summary,
    blocks: snap.blocks, facts: snap.facts, relationships: snap.relationships,
  });
  await writeChildren(tx, a.id, a.worldId, input, Number.POSITIVE_INFINITY);
  if (snap.incoming?.length) {
    const sources = new Set(
      (await tx.select({ id: articles.id }).from(articles).where(inArray(articles.id, snap.incoming.map((r) => r.sourceId)))).map((r) => r.id),
    );
    const restorable = snap.incoming.filter((r) => sources.has(r.sourceId));
    if (restorable.length)
      await tx.insert(relationships).values(
        restorable.map((r) => ({
          worldId: a.worldId, sourceId: r.sourceId, targetId: a.id, type: r.type, note: r.note,
          visibility: r.visibility as "public" | "dm", status: r.status as (typeof STATUSES)[number], source: r.source,
        })),
      );
  }
  await rebuildLinks(tx, { id: a.id, worldId: a.worldId, title: a.title });
  const fresh = await snapshotArticle(tx, a.id);
  await tx.insert(revisions).values({ articleId: a.id, worldId: a.worldId, action, title: a.title, snapshot: fresh!, note, createdBy: userId, actor });
  return { id: a.id, slug };
}

export async function restoreRevision(v: Viewer, revisionId: string) {
  if (!isEditor(v)) throw new MutationError("Sign in as a DM or editor to restore entries.", 403);
  if (!UUID.test(revisionId)) throw new MutationError("That revision doesn't exist.", 404);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [rev] = await tx.select().from(revisions).where(eq(revisions.id, revisionId)).limit(1);
    if (!rev) throw new MutationError("That revision doesn't exist.", 404);
    const when = rev.createdAt.toISOString().slice(0, 16).replace("T", " ");
    return applySnapshot(tx, rev.snapshot as Snapshot, v.userId, "restore", `Restored from the ${rev.action} revision of ${when} UTC`, v.displayName);
  });
}

/**
 * Append sections, facts, and connections to an existing entry without touching
 * what is already there. For collaborator keys every addition is guarded
 * (proposed + DM-only + signed). Editors' additions keep the status they send.
 */
export async function proposeAdditions(v: Viewer, ref: string, raw: unknown) {
  if (!canPropose(v)) throw new MutationError("This needs a DM account or a collaborator API key.", 403);
  const parsed = ProposalInput.safeParse(raw);
  if (!parsed.success) throw new MutationError(issues(parsed.error));
  const p = parsed.data;
  if (!p.blocks.length && !p.facts.length && !p.relationships.length) throw new MutationError("Nothing to add: send at least one section, fact, or connection.");
  const world = await getWorld();
  if (!world) throw new MutationError("No world exists yet.", 500);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [a] = await tx
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.worldId, world.id), UUID.test(ref) ? eq(articles.id, ref) : eq(articles.slug, ref)))
      .limit(1);
    if (!a) throw new MutationError("That entry doesn't exist.", 404);
    const snap = (await snapshotArticle(tx, a.id))!;
    const existing = ArticleInput.parse({
      title: snap.article.title, type: snap.article.type, status: snap.article.status, visibility: snap.article.visibility,
      summary: snap.article.summary, blocks: snap.blocks, facts: snap.facts, relationships: snap.relationships,
    });
    const blocks = p.blocks.map((b) => guardAgentWrite(v, b));
    const facts = p.facts.map((f) => guardAgentWrite(v, f));
    const rels = p.relationships.map((r) => guardAgentWrite(v, r));
    await writeChildren(
      tx,
      a.id,
      world.id,
      { ...existing, blocks: [...existing.blocks, ...blocks], facts: [...existing.facts, ...facts], relationships: [...existing.relationships, ...rels] },
      existing.blocks.length, // only the new sections get link resolution
    );
    await tx.update(articles).set({ updatedAt: new Date(), updatedBy: v.userId }).where(eq(articles.id, a.id));
    await rebuildLinks(tx, { id: a.id, worldId: world.id, title: snap.article.title });
    const fresh = await snapshotArticle(tx, a.id);
    const summary = [blocks.length && `${blocks.length} section(s)`, facts.length && `${facts.length} fact(s)`, rels.length && `${rels.length} connection(s)`].filter(Boolean).join(", ");
    await tx.insert(revisions).values({
      articleId: a.id, worldId: world.id, action: "proposal", title: snap.article.title, snapshot: fresh!,
      note: `${v.role === "agent" ? "Proposed" : "Added"} ${summary}${p.note ? `: ${p.note}` : ""}`, createdBy: v.userId, actor: v.displayName,
    });
    return { id: a.id, slug: fresh!.article.slug, added: { blocks: blocks.length, facts: facts.length, relationships: rels.length } };
  });
}

export { mapDoc };
