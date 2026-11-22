/**
 * Permission-aware reads. Every exported function takes a Viewer.
 * Rule: DM-only rows are excluded in SQL, never fetched-then-hidden.
 */
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type DB } from "@/db/client";
import { articles, articleBlocks, articleFacts, relationships, worlds, revisions, users, type Article } from "@/db/schema";
import { seesDm, isEditor, visibleTo, visSql, type Viewer } from "./access";
import { extractWikiLinks, type PMNode } from "./doc";
import { CATEGORIES, type CategorySlug } from "./vocab";

async function rows<T>(db: DB, q: SQL): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows: T[] };
  return r.rows;
}

function where(...conds: (SQL | undefined)[]) {
  return and(...conds.filter(Boolean));
}

// ---- World ----------------------------------------------------------------

export async function getWorld() {
  const db = await getDb();
  const slug = process.env.WORLD_SLUG ?? "uthandar";
  const [w] = await db.select().from(worlds).where(eq(worlds.slug, slug)).limit(1);
  if (w) return w;
  const [first] = await db.select().from(worlds).limit(1);
  return first ?? null;
}

export type ArticleCard = Pick<Article, "id" | "slug" | "title" | "type" | "summary" | "status" | "visibility" | "updatedAt">;

const cardCols = {
  id: articles.id,
  slug: articles.slug,
  title: articles.title,
  type: articles.type,
  summary: articles.summary,
  status: articles.status,
  visibility: articles.visibility,
  updatedAt: articles.updatedAt,
};

// ---- Listing --------------------------------------------------------------

export async function listArticles(
  v: Viewer,
  opts: { types?: readonly string[]; limit?: number; order?: "title" | "recent"; excludeNotes?: boolean } = {},
): Promise<ArticleCard[]> {
  const db = await getDb();
  const world = await getWorld();
  if (!world) return [];
  const q = db
    .select(cardCols)
    .from(articles)
    .where(
      where(
        eq(articles.worldId, world.id),
        visibleTo(v, articles.visibility),
        opts.types?.length ? inArray(articles.type, [...opts.types]) : undefined,
        opts.excludeNotes ? sql`${articles.type} <> 'note'` : undefined,
      ),
    )
    .orderBy(opts.order === "recent" ? desc(articles.updatedAt) : asc(sql`lower(${articles.title})`));
  return opts.limit ? q.limit(opts.limit) : q;
}

export async function categoryCounts(v: Viewer): Promise<Record<CategorySlug, number>> {
  const db = await getDb();
  const world = await getWorld();
  const out = Object.fromEntries(CATEGORIES.map((c) => [c.slug, 0])) as Record<CategorySlug, number>;
  if (!world) return out;
  const r = await db
    .select({ type: articles.type, n: sql<number>`count(*)::int` })
    .from(articles)
    .where(where(eq(articles.worldId, world.id), visibleTo(v, articles.visibility)))
    .groupBy(articles.type);
  for (const c of CATEGORIES) {
    out[c.slug] = r.filter((x) => (c.types as readonly string[]).includes(x.type)).reduce((a, x) => a + Number(x.n), 0);
  }
  return out;
}

// ---- Single article -------------------------------------------------------

export type LinkTarget = { id: string; slug: string; title: string };

export type RelView = {
  id: string;
  type: string;
  outgoing: boolean;
  note: string | null;
  status: string;
  visibility: "public" | "dm";
  other: { id: string; slug: string; title: string; type: string; visibility: "public" | "dm" };
};

export async function getArticleBySlug(v: Viewer, slug: string) {
  const db = await getDb();
  const world = await getWorld();
  if (!world) return null;
  const [a] = await db
    .select()
    .from(articles)
    .where(where(eq(articles.worldId, world.id), eq(articles.slug, slug), visibleTo(v, articles.visibility)))
    .limit(1);
  return a ?? null;
}

export async function getArticleView(v: Viewer, slug: string) {
  const db = await getDb();
  const article = await getArticleBySlug(v, slug);
  if (!article) return null;

  const blocks = await db
    .select()
    .from(articleBlocks)
    .where(where(eq(articleBlocks.articleId, article.id), visibleTo(v, articleBlocks.visibility)))
    .orderBy(asc(articleBlocks.position));

  const facts = await db
    .select()
    .from(articleFacts)
    .where(where(eq(articleFacts.articleId, article.id), visibleTo(v, articleFacts.visibility)))
    .orderBy(asc(articleFacts.position));

  const rels = await getRelationshipsFor(v, article.id);
  const linkTargets = await resolveLinkTargets(v, blocks.map((b) => b.content as PMNode));
  const backlinks = await getBacklinks(v, article.id);
  const related = await getRelated(v, article);

  // For DMs only: how much of this entry visitors do NOT see.
  let hidden: { blocks: number; facts: number; relationships: number } | null = null;
  if (seesDm(v)) {
    hidden = {
      blocks: blocks.filter((b) => b.visibility === "dm").length,
      facts: facts.filter((f) => f.visibility === "dm").length,
      relationships: rels.filter((r) => r.visibility === "dm" || r.other.visibility === "dm").length,
    };
  }

  if (!seesDm(v)) {
    // Provenance notes and tags are editorial metadata: DM eyes only.
    return {
      article: { ...article, source: null, tags: [], createdBy: null, updatedBy: null },
      blocks: blocks.map((b) => ({ ...b, source: null })),
      facts: facts.map((f) => ({ ...f, source: null })),
      relationships: rels,
      linkTargets,
      backlinks,
      related,
      hidden,
    };
  }
  return { article, blocks, facts, relationships: rels, linkTargets, backlinks, related, hidden };
}

export async function getRelationshipsFor(v: Viewer, articleId: string): Promise<RelView[]> {
  const db = await getDb();
  const other = alias(articles, "other");
  const base = {
    id: relationships.id,
    type: relationships.type,
    note: relationships.note,
    status: relationships.status,
    visibility: relationships.visibility,
    otherId: other.id,
    otherSlug: other.slug,
    otherTitle: other.title,
    otherType: other.type,
    otherVis: other.visibility,
  };
  const out = await db
    .select(base)
    .from(relationships)
    .innerJoin(other, eq(other.id, relationships.targetId))
    .where(where(eq(relationships.sourceId, articleId), visibleTo(v, relationships.visibility), visibleTo(v, other.visibility)));
  const inc = await db
    .select(base)
    .from(relationships)
    .innerJoin(other, eq(other.id, relationships.sourceId))
    .where(where(eq(relationships.targetId, articleId), visibleTo(v, relationships.visibility), visibleTo(v, other.visibility)));
  const map = (r: (typeof out)[number], outgoing: boolean): RelView => ({
    id: r.id,
    type: r.type,
    outgoing,
    note: seesDm(v) ? r.note : r.visibility === "public" ? r.note : null,
    status: r.status,
    visibility: r.visibility,
    other: { id: r.otherId, slug: r.otherSlug, title: r.otherTitle, type: r.otherType, visibility: r.otherVis },
  });
  return [...out.map((r) => map(r, true)), ...inc.map((r) => map(r, false))];
}

/** Resolve [[links]] in already-visible docs to articles the viewer may see. */
export async function resolveLinkTargets(v: Viewer, docs: PMNode[]) {
  const db = await getDb();
  const world = await getWorld();
  const links = docs.flatMap((d) => extractWikiLinks(d));
  const ids = [...new Set(links.map((l) => l.id).filter((x): x is string => !!x))];
  const titles = [...new Set(links.filter((l) => !l.id).map((l) => l.title.toLowerCase()))];
  const byId = new Map<string, LinkTarget>();
  const byTitle = new Map<string, LinkTarget>();
  if (!world) return { byId, byTitle };
  if (ids.length) {
    const r = await db
      .select({ id: articles.id, slug: articles.slug, title: articles.title })
      .from(articles)
      .where(where(inArray(articles.id, ids), visibleTo(v, articles.visibility)));
    r.forEach((x) => byId.set(x.id, x));
  }
  if (titles.length) {
    const r = await db
      .select({ id: articles.id, slug: articles.slug, title: articles.title })
      .from(articles)
      .where(
        where(eq(articles.worldId, world.id), inArray(sql`lower(${articles.title})`, titles), visibleTo(v, articles.visibility)),
      );
    r.forEach((x) => byTitle.set(x.title.toLowerCase(), x));
  }
  return { byId, byTitle };
}

export async function getBacklinks(v: Viewer, articleId: string) {
  const db = await getDb();
  return rows<{ id: string; slug: string; title: string; type: string; status: string; visibility: string }>(
    db,
    sql`select distinct s.id, s.slug, s.title, s.type, s.status, s.visibility
        from article_links l
        join article_blocks b on b.id = l.block_id
        join articles s on s.id = l.source_article_id
        where l.target_article_id = ${articleId}
          and s.id <> ${articleId}
          and ${visSql(v, "b")} and ${visSql(v, "s")}
        order by s.title`,
  );
}

/** Two-hop neighbours through visible relationships, plus shared tags. */
/** Postgres array literal, passed as ONE bound parameter. */
export function pgTextArray(items: string[]) {
  return "{" + items.map((t) => '"' + t.replace(/["\\]/g, (c) => "\\" + c) + '"').join(",") + "}";
}

export async function getRelated(v: Viewer, a: Article) {
  const db = await getDb();
  const tags = pgTextArray(a.tags ?? []);
  return rows<{ id: string; slug: string; title: string; type: string; via: string }>(
    db,
    sql`with first_hop as (
          select case when r.source_id = ${a.id} then r.target_id else r.source_id end as mid
          from relationships r
          join articles m on m.id = case when r.source_id = ${a.id} then r.target_id else r.source_id end
          where (r.source_id = ${a.id} or r.target_id = ${a.id}) and ${visSql(v, "r")} and ${visSql(v, "m")}
        ),
        second_hop as (
          select distinct case when r.source_id = f.mid then r.target_id else r.source_id end as id, 'connection' as via
          from first_hop f
          join relationships r on (r.source_id = f.mid or r.target_id = f.mid)
          where ${visSql(v, "r")}
        ),
        tagged as (
          select t.id, 'shared tag' as via from articles t
          where t.world_id = ${a.worldId} and t.id <> ${a.id}
            and cardinality(${tags}::text[]) > 0 and t.tags && ${tags}::text[]
            and t.type <> 'note'
        )
        select x.id, x.slug, x.title, x.type, min(c.via) as via
        from (select * from second_hop union all select * from tagged) c
        join articles x on x.id = c.id
        where x.id <> ${a.id}
          and x.id not in (select mid from first_hop)
          and ${visSql(v, "x")}
        group by x.id, x.slug, x.title, x.type
        order by x.title
        limit 8`,
  );
}

// ---- Search & autocomplete ------------------------------------------------

function prefixQuery(q: string): string | null {
  const terms = q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/['-]/g, ""))
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (!terms.length) return null;
  return terms.map((t) => `${t}:*`).join(" & ");
}

export type SearchHit = {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  visibility: string;
  snippet: string;
  rank: number;
};

/**
 * Full-text search over ONLY the text this viewer may read: visible titles,
 * summaries, facts, and sections of visible articles. Snippets are generated
 * from that same filtered text, so they can't quote hidden material.
 */
export async function search(v: Viewer, q: string): Promise<SearchHit[]> {
  const tsq = prefixQuery(q);
  if (!tsq) return [];
  const db = await getDb();
  const world = await getWorld();
  if (!world) return [];
  const hits = await rows<SearchHit & { snippet: string | null }>(
    db,
    sql`with docs as (
          select a.id, a.title || ' ' || coalesce(a.summary, '') as body, 2.0 as weight
          from articles a where a.world_id = ${world.id} and ${visSql(v, "a")}
          union all
          select a.id, coalesce(b.heading, '') || ' ' || b.plain_text, 1.0
          from article_blocks b join articles a on a.id = b.article_id
          where a.world_id = ${world.id} and ${visSql(v, "a")} and ${visSql(v, "b")}
          union all
          select a.id, f.label || ': ' || coalesce(f.value, ''), 1.0
          from article_facts f join articles a on a.id = f.article_id
          where a.world_id = ${world.id} and ${visSql(v, "a")} and ${visSql(v, "f")}
        ),
        matched as (
          select id, body, weight * ts_rank(to_tsvector('simple', body), to_tsquery('simple', ${tsq})) as rank
          from docs
          where to_tsvector('simple', body) @@ to_tsquery('simple', ${tsq})
        ),
        best as (
          select distinct on (id) id, body, rank from matched order by id, rank desc
        )
        select a.id, a.slug, a.title, a.type, a.status, a.visibility, b.rank,
          ts_headline('simple', b.body, to_tsquery('simple', ${tsq}),
            'StartSel=«, StopSel=», MaxWords=28, MinWords=10, ShortWord=2') as snippet
        from best b join articles a on a.id = b.id
        order by (lower(a.title) like ${q.trim().toLowerCase() + "%"}) desc, b.rank desc, a.title
        limit 30`,
  );
  return hits.map((h) => ({ ...h, rank: Number(h.rank), snippet: h.snippet ?? "" }));
}

export async function suggest(v: Viewer, q: string, limit = 8) {
  const db = await getDb();
  const world = await getWorld();
  if (!world) return [];
  const needle = q.trim().toLowerCase().replace(/[%_\\]/g, (c) => "\\" + c);
  return db
    .select({ id: articles.id, slug: articles.slug, title: articles.title, type: articles.type, visibility: articles.visibility })
    .from(articles)
    .where(
      where(
        eq(articles.worldId, world.id),
        visibleTo(v, articles.visibility),
        needle ? sql`lower(${articles.title}) like ${"%" + needle + "%"}` : undefined,
      ),
    )
    .orderBy(sql`(lower(${articles.title}) like ${needle + "%"}) desc`, asc(articles.title))
    .limit(Math.min(limit, 20));
}

// ---- Graph ----------------------------------------------------------------

export type GraphNode = { id: string; slug: string; title: string; type: string; visibility: string };
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "relationship" | "mention";
  type: string;
  visibility: string;
  status: string;
};

/**
 * Focused graph: the article and its direct neighbours. Both endpoints AND the
 * edge itself must be visible; mentions only count from visible sections.
 */
export async function getNeighbourhood(v: Viewer, slug: string) {
  const center = await getArticleBySlug(v, slug);
  if (!center) return null;
  const db = await getDb();
  const relEdges = await rows<GraphEdge & { s: GraphNode; t: GraphNode }>(
    db,
    sql`select r.id, r.source_id as source, r.target_id as target, 'relationship' as kind, r.type,
               r.visibility, r.status
        from relationships r
        join articles s on s.id = r.source_id
        join articles t on t.id = r.target_id
        where (r.source_id = ${center.id} or r.target_id = ${center.id})
          and ${visSql(v, "r")} and ${visSql(v, "s")} and ${visSql(v, "t")}`,
  );
  const mentionEdges = await rows<GraphEdge>(
    db,
    sql`select distinct on (l.source_article_id, l.target_article_id)
               'm-' || l.source_article_id || '-' || l.target_article_id as id,
               l.source_article_id as source, l.target_article_id as target, 'mention' as kind,
               'mentions' as type, b.visibility, b.status
        from article_links l
        join article_blocks b on b.id = l.block_id
        join articles s on s.id = l.source_article_id
        join articles t on t.id = l.target_article_id
        where (l.source_article_id = ${center.id} or l.target_article_id = ${center.id})
          and l.source_article_id <> l.target_article_id
          and ${visSql(v, "b")} and ${visSql(v, "s")} and ${visSql(v, "t")}
        order by l.source_article_id, l.target_article_id, b.visibility`,
  );
  const edges: GraphEdge[] = [...relEdges, ...mentionEdges].map((e) => ({
    id: String(e.id),
    source: String(e.source),
    target: String(e.target),
    kind: e.kind,
    type: e.type,
    visibility: e.visibility,
    status: e.status,
  }));
  const ids = [...new Set([center.id, ...edges.flatMap((e) => [e.source, e.target])])];
  const nodes = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title, type: articles.type, visibility: articles.visibility })
    .from(articles)
    .where(where(inArray(articles.id, ids), visibleTo(v, articles.visibility)));
  const nodeIds = new Set(nodes.map((n) => n.id));
  return {
    center: center.id,
    nodes,
    // Defence in depth: never return an edge whose endpoint isn't in the visible node set.
    edges: edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
  };
}

// ---- Editor-only reads ----------------------------------------------------

export async function getArticleForEditing(v: Viewer, slug: string) {
  if (!isEditor(v)) return null;
  const db = await getDb();
  const world = await getWorld();
  if (!world) return null;
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.worldId, world.id), eq(articles.slug, slug)))
    .limit(1);
  if (!article) return null;
  const blocks = await db.select().from(articleBlocks).where(eq(articleBlocks.articleId, article.id)).orderBy(asc(articleBlocks.position));
  const facts = await db.select().from(articleFacts).where(eq(articleFacts.articleId, article.id)).orderBy(asc(articleFacts.position));
  const target = alias(articles, "target");
  const outgoing = await db
    .select({
      id: relationships.id,
      type: relationships.type,
      note: relationships.note,
      visibility: relationships.visibility,
      status: relationships.status,
      source: relationships.source,
      targetId: target.id,
      targetTitle: target.title,
      targetSlug: target.slug,
    })
    .from(relationships)
    .innerJoin(target, eq(target.id, relationships.targetId))
    .where(eq(relationships.sourceId, article.id));
  const incoming = await getRelationshipsFor({ ...v, preview: false }, article.id).then((r) => r.filter((x) => !x.outgoing));
  return { article, blocks, facts, outgoing, incoming };
}

export async function listRevisions(v: Viewer, articleId: string) {
  if (!isEditor(v)) return [];
  const db = await getDb();
  return db
    .select({
      id: revisions.id,
      action: revisions.action,
      title: revisions.title,
      note: revisions.note,
      createdAt: revisions.createdAt,
      by: sql<string | null>`coalesce(${revisions.actor}, ${users.displayName})`,
    })
    .from(revisions)
    .leftJoin(users, eq(users.id, revisions.createdBy))
    .where(eq(revisions.articleId, articleId))
    .orderBy(desc(revisions.createdAt));
}

export async function getRevision(v: Viewer, id: string) {
  if (!isEditor(v) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [r] = await db.select().from(revisions).where(eq(revisions.id, id)).limit(1);
  return r ?? null;
}

export async function ledgerOverview(v: Viewer) {
  if (!isEditor(v)) return null;
  const db = await getDb();
  const world = await getWorld();
  if (!world) return null;
  const recent = await db
    .select(cardCols)
    .from(articles)
    .where(eq(articles.worldId, world.id))
    .orderBy(desc(articles.updatedAt))
    .limit(12);
  const byStatus = await db
    .select({ status: articles.status, visibility: articles.visibility, n: sql<number>`count(*)::int` })
    .from(articles)
    .where(eq(articles.worldId, world.id))
    .groupBy(articles.status, articles.visibility);
  const review = await db
    .select(cardCols)
    .from(articles)
    .where(and(eq(articles.worldId, world.id), inArray(articles.status, ["draft", "proposed"]), eq(articles.visibility, "public")))
    .orderBy(asc(articles.title));
  const deleted = await rows<{ id: string; article_id: string; title: string; created_at: string }>(
    db,
    sql`select r.id, r.article_id, r.title, r.created_at from revisions r
        where r.world_id = ${world.id} and r.action = 'delete'
          and not exists (select 1 from articles a where a.id = r.article_id)
        order by r.created_at desc limit 20`,
  );
  // Work from collaborator keys / the inbox (no user account behind it).
  const proposals = await rows<{ id: string; title: string; slug: string | null; actor: string; note: string | null; created_at: string }>(
    db,
    sql`select r.id, r.title, a.slug, r.actor, r.note, r.created_at from revisions r
        left join articles a on a.id = r.article_id
        where r.world_id = ${world.id} and r.created_by is null and r.actor is not null
          and r.action in ('create', 'proposal')
        order by r.created_at desc limit 15`,
  );
  return { recent, byStatus, review, deleted, proposals };
}
