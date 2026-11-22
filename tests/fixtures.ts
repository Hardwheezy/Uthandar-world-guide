/**
 * Test fixture: a fresh in-memory database with the real seed + starter import,
 * plus CANARY content planted on every surface a secret could leak through.
 * Canary content exists only in tests; it is not setting lore.
 */
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { setDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { seed } from "@/db/seed";
import { importStarter } from "@/db/import-starter";
import { saveArticle } from "@/lib/mutations";
import type { Viewer } from "@/lib/access";
import type { PMDoc } from "@/lib/doc";

export const CANARY = "zqxcanary";

const txt = (t: string): PMDoc => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

export async function makeFixture() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  setDb(db, () => client.close());
  await runMigrations(db);
  const { dm, player } = await seed(db, () => {});
  await importStarter(db, path.resolve("content/starter-wiki"), () => {});

  const editor: Viewer = { userId: dm.id, role: "admin", displayName: dm.displayName, preview: false };
  const previewing: Viewer = { ...editor, preview: true };
  const playerV: Viewer = { userId: player.id, role: "player", displayName: player.displayName, preview: false };

  const id = async (slug: string) => (await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.slug, slug)))[0].id;
  const harlan = await id("harlan");
  const mercer = await id("mercer-family");

  // 1. An entirely DM-only article whose title, summary, facts and sections are all secret.
  const secret = await saveArticle(editor, {
    title: `The ${CANARY} Compact`,
    type: "faction",
    status: "draft",
    visibility: "dm",
    summary: `${CANARY} summary`,
    tags: ["mercer", CANARY],
    source: `${CANARY} source`,
    facts: [{ label: `${CANARY} fact`, value: `${CANARY} value`, visibility: "public", status: "draft" }],
    blocks: [
      // A "public" block inside a DM-only article must still be hidden.
      { heading: `${CANARY} heading`, content: txt(`${CANARY} public-flagged block in a secret article`), visibility: "public", status: "draft", framing: "account" },
      { heading: null, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "wikiLink", attrs: { id: harlan, title: "Harlan", label: null } }] }] }, visibility: "dm", status: "draft", framing: "account" },
    ],
    // Public-flagged edge to a public article: must vanish because the source is secret.
    relationships: [{ type: "funds", targetId: mercer, visibility: "public", status: "draft", note: `${CANARY} note` }],
  });

  // 2. A public article carrying DM-only material of every kind, and a public link to the secret.
  const mixed = await saveArticle(editor, {
    title: "Test Waystation",
    type: "place",
    status: "draft",
    visibility: "public",
    summary: "A public test entry.",
    tags: ["mercer", `${CANARY}-tag`],
    source: `${CANARY} provenance`,
    facts: [
      { label: "Open fact", value: "visible", visibility: "public", status: "draft", source: `${CANARY} fact source` },
      { label: `${CANARY} hidden fact`, value: `${CANARY} fact value`, visibility: "dm", status: "draft" },
    ],
    blocks: [
      {
        heading: "Public section",
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Rumour points to " }, { type: "wikiLink", attrs: { id: secret.id, title: `The ${CANARY} Compact`, label: "a quiet compact" } }] }] },
        visibility: "public",
        status: "draft",
        framing: "hearsay",
        source: `${CANARY} block source`,
      },
      { heading: `${CANARY} ledger heading`, content: txt(`${CANARY} the real plan`), visibility: "dm", status: "draft", framing: "account" },
      {
        heading: null,
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `${CANARY} dm mention ` }, { type: "wikiLink", attrs: { id: harlan, title: "Harlan", label: null } }] }] },
        visibility: "dm",
        status: "draft",
        framing: "account",
      },
    ],
    relationships: [
      { type: "opposes", targetId: harlan, visibility: "dm", status: "draft", note: `${CANARY} dm edge` },
      { type: "serves", targetId: secret.id, visibility: "public", status: "draft", note: `${CANARY} edge to secret` },
      { type: "located_in", targetId: await id("tallwater"), visibility: "public", status: "draft", note: null, source: `${CANARY} rel source` },
    ],
  });

  return { db, client, editor, previewing, player: playerV, secret, mixed, harlan, mercer };
}
