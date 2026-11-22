/**
 * Seed data for the first vertical slice.
 *
 * Rules followed here:
 *  - Only the world name and the unnamed-continent decision are canon (Decision Log, 2026-11-22).
 *  - Tallwater, the Mercer family, and Harlan exist as named working examples. Nothing about
 *    their history, business, politics, or aims is invented. Empty sections render as
 *    "To be established".
 *  - The ONE author-provided DM fact (Harlan's commitment to an unnamed objective) is seeded as
 *    `draft` with its source attached.
 *  - The connections Harlan → Mercer family → Tallwater are implied by the handoffs but never
 *    stated, so they are `draft` relationships, not canon.
 */
import { eq } from "drizzle-orm";
import type { DB } from "./client";
import { users, worlds, articles } from "./schema";
import { hashPassword } from "@/lib/auth";
import { saveArticle, type ArticleInputT } from "@/lib/mutations";
import type { Viewer } from "@/lib/access";
import type { PMDoc, PMNode } from "@/lib/doc";

const p = (...parts: (string | PMNode)[]): PMNode => ({
  type: "paragraph",
  content: parts.map((x) => (typeof x === "string" ? { type: "text", text: x } : x)),
});
const link = (title: string, label: string | null = null): PMNode => ({ type: "wikiLink", attrs: { id: null, title, label } });
const doc = (...content: PMNode[]): PMDoc => ({ type: "doc", content: content.length ? content : [{ type: "paragraph" }] });
const bullets = (...items: PMNode[][]): PMNode => ({
  type: "bulletList",
  content: items.map((parts) => ({ type: "listItem", content: [{ type: "paragraph", content: parts }] })),
});
const EMPTY = doc();

async function ensureUser(db: DB, email: string, password: string, name: string, role: "player" | "editor" | "admin") {
  const e = email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, e)).limit(1);
  if (existing) return { user: existing, created: false };
  const [user] = await db.insert(users).values({ email: e, displayName: name, role, passwordHash: await hashPassword(password) }).returning();
  return { user, created: true };
}

export async function seed(db: DB, log: (s: string) => void = console.log) {
  let [world] = await db.select().from(worlds).where(eq(worlds.slug, "uthandar")).limit(1);
  if (!world) {
    [world] = await db
      .insert(worlds)
      .values({ slug: "uthandar", name: "Uthandar", tagline: "A field guide kept by the Adventurer's Guild" })
      .returning();
    log("Created world: Uthandar");
  }

  const dm = await ensureUser(
    db,
    process.env.SEED_DM_EMAIL ?? "dm@uthandar.local",
    process.env.SEED_DM_PASSWORD ?? "change-me-before-sharing",
    process.env.SEED_DM_NAME ?? "Dungeon Master",
    "admin",
  );
  const player = await ensureUser(
    db,
    process.env.SEED_PLAYER_EMAIL ?? "player@uthandar.local",
    process.env.SEED_PLAYER_PASSWORD ?? "change-me-too",
    "Player",
    "player",
  );
  if (dm.created) log(`Created DM account: ${dm.user.email} (password from SEED_DM_PASSWORD / .env.example)`);
  if (player.created) log(`Created player account: ${player.user.email}`);

  const system: Viewer = { userId: dm.user.id, role: "admin", displayName: dm.user.displayName, preview: false };

  const existing = new Set((await db.select({ slug: articles.slug }).from(articles)).map((r) => r.slug));
  const idOf = async (slug: string) => (await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, slug)))[0]?.id;

  const entries: (ArticleInputT & { slug: string })[] = [];

  entries.push({
    slug: "uthandar",
    title: "Uthandar",
    type: "world",
    status: "canon",
    visibility: "public",
    summary: "Uthandar is the world in which this setting takes place.",
    source: "World name and continent-naming approach: explicit author decisions, Decision Log 2026-11-22.",
    tags: ["world"],
    facts: [
      { label: "Kind", value: "World", visibility: "public", status: "canon", source: null },
      { label: "Main continent", value: "No single established name", visibility: "public", status: "canon", source: "Decision Log, 2026-11-22 (Option B)" },
      { label: "Regions and kingdoms", value: null, visibility: "public", status: "draft", source: null },
      { label: "Cosmology", value: null, visibility: "public", status: "draft", source: null },
    ],
    blocks: [
      {
        heading: "The land without one name",
        visibility: "public",
        status: "canon",
        framing: "account",
        source: "Uthandar — World Overview (canon)",
        content: doc(
          p("No single name for the great continent is shared by everyone who lives on it. Its peoples speak of their own kingdoms, regions, waterways, and traditional lands instead."),
          p("Those regions, their names, and their borders have not yet been entered in this guide."),
        ),
      },
      {
        heading: "Peoples, faiths, and history",
        visibility: "public",
        status: "draft",
        framing: "account",
        source: null,
        content: EMPTY,
      },
      {
        heading: "Editorial record",
        visibility: "dm",
        status: "reference",
        framing: "account",
        source: "Decision Log; Canon and Status Policy",
        content: doc(
          p("Canon: the world is named Uthandar (U-T-H-A-N-D-A-R), and the main continent deliberately has no universal name. See ", link("Uthandar — World Overview"), " and ", link("Decision Log"), "."),
          p("Estara was suggested earlier. It is not the world name and not an approved continent name."),
          p("Not yet established: a continental map, borders, kingdoms, regional names, cosmology, and whether a foundational catastrophe happened. Open threads live in ", link("Open Questions"), "."),
        ),
      },
    ],
    relationships: [],
  });

  entries.push({
    slug: "tallwater",
    title: "Tallwater",
    type: "place",
    status: "draft",
    visibility: "public",
    summary: null,
    source: "Named by the author as a working example in the site handoffs. No details provided yet.",
    tags: ["tallwater"],
    template: "place",
    facts: [
      { label: "Kind of place", value: null, visibility: "public", status: "draft", source: null },
      { label: "Region", value: null, visibility: "public", status: "draft", source: null },
      { label: "Ruled by", value: null, visibility: "public", status: "draft", source: null },
    ],
    blocks: [
      { heading: "At first sight", visibility: "public", status: "draft", framing: "account", source: null, content: EMPTY },
      {
        heading: "Notable people and families",
        visibility: "public",
        status: "draft",
        framing: "account",
        source: "Implied by the site handoffs; not yet confirmed",
        content: doc(bullets([link("Mercer family")])),
      },
      { heading: "What the locals don't say", visibility: "dm", status: "draft", framing: "account", source: null, content: EMPTY },
      { heading: "Pressures and trajectory", visibility: "dm", status: "draft", framing: "account", source: null, content: EMPTY },
    ],
    relationships: [],
  });

  entries.push({
    slug: "mercer-family",
    title: "Mercer family",
    type: "family",
    status: "draft",
    visibility: "public",
    summary: null,
    source: "Named by the author as a working example in the site handoffs. Business, political role, and history not yet provided.",
    tags: ["tallwater", "mercer"],
    template: "family",
    facts: [
      { label: "Business", value: null, visibility: "public", status: "draft", source: null },
      { label: "Political role", value: null, visibility: "public", status: "draft", source: null },
    ],
    blocks: [
      { heading: "Standing in Tallwater", visibility: "public", status: "draft", framing: "account", source: null, content: EMPTY },
      {
        heading: "Known members",
        visibility: "public",
        status: "draft",
        framing: "account",
        source: "Implied by the site handoffs; not yet confirmed",
        content: doc(bullets([link("Harlan")])),
      },
      { heading: "Internal tensions", visibility: "dm", status: "draft", framing: "account", source: null, content: EMPTY },
      { heading: "Ambitions and grievances", visibility: "dm", status: "draft", framing: "account", source: null, content: EMPTY },
      { heading: "What happens if nobody intervenes", visibility: "dm", status: "draft", framing: "account", source: null, content: EMPTY },
    ],
    relationships: [],
  });

  entries.push({
    slug: "harlan",
    title: "Harlan",
    type: "person",
    status: "draft",
    visibility: "public",
    summary: null,
    source: "Named by the author as a working example in the site handoffs.",
    tags: ["tallwater", "mercer"],
    template: "person",
    facts: [
      { label: "Role", value: null, visibility: "public", status: "draft", source: null },
      { label: "The objective", value: null, visibility: "dm", status: "draft", source: "Awaiting author input" },
    ],
    blocks: [
      { heading: "Who they are", visibility: "public", status: "draft", framing: "account", source: null, content: EMPTY },
      { heading: "Reputation", visibility: "public", status: "draft", framing: "account", source: null, content: EMPTY },
      {
        heading: "Goals and motivations",
        visibility: "dm",
        status: "draft",
        framing: "account",
        source: "Author statement, original site handoff §4",
        content: doc(
          p("The author has said Harlan is deeply committed to an objective and willing to go very far to pursue it."),
          p("What that objective is has not been provided."),
        ),
      },
      { heading: "Loyalties and grievances", visibility: "dm", status: "draft", framing: "account", source: null, content: EMPTY },
      { heading: "Resources", visibility: "dm", status: "draft", framing: "account", source: null, content: EMPTY },
      { heading: "Concealed relationships", visibility: "dm", status: "draft", framing: "account", source: null, content: EMPTY },
      { heading: "Possible next moves", visibility: "dm", status: "draft", framing: "account", source: null, content: EMPTY },
    ],
    relationships: [],
  });

  for (const e of entries) {
    if (existing.has(e.slug)) {
      log(`Skipped ${e.title} (already exists)`);
      continue;
    }
    const rel = async (type: string, slug: string, status: "canon" | "draft") => {
      const targetId = await idOf(slug);
      return targetId ? [{ type, targetId, note: null, visibility: "public" as const, status, source: "Implied by the site handoffs" }] : [];
    };
    if (e.slug === "tallwater") e.relationships = await rel("located_in", "uthandar", "draft");
    if (e.slug === "mercer-family") e.relationships = await rel("active_in", "tallwater", "draft");
    if (e.slug === "harlan") e.relationships = await rel("member_of", "mercer-family", "draft");
    await saveArticle(system, e, { action: "seed" });
    log(`Seeded ${e.title}`);
  }
  return { world, dm: dm.user, player: player.user };
}
