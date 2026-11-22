/**
 * Content model — deliberately small.
 *
 *  world ─┬─ article ─┬─ article_block   (sections: public guide text or DM Ledger text)
 *         │           ├─ article_fact    (at-a-glance facts; null value = "To be established")
 *         │           └─ article_link    (derived index of [[wiki links]] for backlinks/graph)
 *         ├─ relationship                (typed, directed edges between articles)
 *         └─ revision                    (full snapshots; survive article deletion)
 *  user ── session
 *
 * Two independent axes on every piece of content:
 *   - status      = editorial truth (canon / draft / proposed / research / reference / rejected)
 *   - visibility  = audience (public / dm). Campaign-scoped visibility can be added later.
 * An article's visibility gates everything attached to it; a public article can still
 * carry DM-only blocks, facts, and relationships.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  serial,
} from "drizzle-orm/pg-core";

export const editorialStatus = pgEnum("editorial_status", [
  "canon",
  "draft",
  "proposed",
  "research",
  "reference",
  "rejected",
]);

export const visibility = pgEnum("visibility", ["public", "dm"]);

export const userRole = pgEnum("user_role", ["player", "editor", "admin"]);

/** What an API key may do. `agent` = collaborator: reads all, writes only guarded proposals. */
export const tokenRole = pgEnum("token_role", ["agent", "editor"]);

/** In-world reliability of a section — separate from editorial status. */
export const framing = pgEnum("framing", ["account", "hearsay", "contested", "belief"]);

export const worlds = pgTable("worlds", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("player"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  /** sha256 of the session token; the raw token only ever lives in the cookie */
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** API keys for collaborators (e.g. Vee, Claude). Only the SHA-256 of a key is stored. */
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  /** First characters of the key, shown so you can tell keys apart. */
  prefix: text("prefix").notNull(),
  role: tokenRole("role").notNull().default("agent"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    type: text("type").notNull(),
    /** Public "at a glance" line. Null renders as "To be established". */
    summary: text("summary"),
    status: editorialStatus("status").notNull().default("draft"),
    visibility: visibility("visibility").notNull().default("dm"),
    template: text("template"),
    tags: text("tags").array().notNull().default([]),
    /** Provenance: where this came from / who approved it. */
    source: text("source"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("articles_world_slug").on(t.worldId, t.slug),
    index("articles_type").on(t.worldId, t.type),
  ],
);

export const articleBlocks = pgTable(
  "article_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    heading: text("heading"),
    /** ProseMirror / Tiptap JSON document */
    content: jsonb("content").notNull(),
    /** Derived from content on save; used for search and snippets */
    plainText: text("plain_text").notNull().default(""),
    visibility: visibility("visibility").notNull().default("dm"),
    status: editorialStatus("status").notNull().default("draft"),
    framing: framing("framing").notNull().default("account"),
    source: text("source"),
  },
  (t) => [index("blocks_article").on(t.articleId, t.position)],
);

export const articleFacts = pgTable(
  "article_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label").notNull(),
    value: text("value"),
    visibility: visibility("visibility").notNull().default("dm"),
    status: editorialStatus("status").notNull().default("draft"),
    source: text("source"),
  },
  (t) => [index("facts_article").on(t.articleId, t.position)],
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    note: text("note"),
    visibility: visibility("visibility").notNull().default("dm"),
    status: editorialStatus("status").notNull().default("draft"),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rel_source").on(t.sourceId), index("rel_target").on(t.targetId)],
);

/** Derived index of [[wiki links]], rebuilt whenever an article is saved. */
export const articleLinks = pgTable(
  "article_links",
  {
    id: serial("id").primaryKey(),
    blockId: uuid("block_id")
      .notNull()
      .references(() => articleBlocks.id, { onDelete: "cascade" }),
    sourceArticleId: uuid("source_article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    /** Null when the link points at a page that doesn't exist yet */
    targetArticleId: uuid("target_article_id").references(() => articles.id, {
      onDelete: "set null",
    }),
    targetTitle: text("target_title").notNull(),
  },
  (t) => [index("links_target").on(t.targetArticleId), index("links_source").on(t.sourceArticleId)],
);

/**
 * Full-article snapshots. article_id is intentionally NOT a foreign key so that
 * history survives deletion and a deleted article can be restored.
 */
export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id").notNull(),
    worldId: uuid("world_id").notNull(),
    action: text("action").notNull(), // create | update | restore | delete | import | seed
    title: text("title").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    note: text("note"),
    createdBy: uuid("created_by"),
    /** Human-readable author: a user's name or an API key's name. */
    actor: text("actor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("revisions_article").on(t.articleId, t.createdAt)],
);

/** Which inbox files (by path + content hash) have already been imported. */
export const inboxImports = pgTable(
  "inbox_imports",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    contentHash: text("content_hash").notNull(),
    author: text("author").notNull(),
    articleId: uuid("article_id"),
    action: text("action").notNull(), // created | proposed
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inbox_path_hash").on(t.path, t.contentHash)],
);

export type Article = typeof articles.$inferSelect;
export type ArticleBlock = typeof articleBlocks.$inferSelect;
export type ArticleFact = typeof articleFacts.$inferSelect;
export type Relationship = typeof relationships.$inferSelect;
export type Revision = typeof revisions.$inferSelect;
export type User = typeof users.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type EditorialStatus = (typeof editorialStatus.enumValues)[number];
export type Visibility = (typeof visibility.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
export type Framing = (typeof framing.enumValues)[number];
