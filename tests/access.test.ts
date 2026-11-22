/**
 * Negative tests: DM-only material must be absent from every read surface for
 * visitors, players, and editors in public preview. Each surface also has a
 * positive control proving the canary really is there for an editor.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS, type Viewer } from "@/lib/access";
import {
  categoryCounts,
  getArticleView,
  getBacklinks,
  getNeighbourhood,
  getRelated,
  listArticles,
  listRevisions,
  search,
  suggest,
  getArticleForEditing,
  getRevision,
  ledgerOverview,
  getArticleBySlug,
} from "@/lib/queries";
import { buildExport, exportToMarkdownZip } from "@/lib/export";
import { sanitizeDocForViewer, type PMNode } from "@/lib/doc";
import { saveArticle, deleteArticle, restoreRevision, MutationError } from "@/lib/mutations";
import { closeDb } from "@/db/client";
import { unzipSync, strFromU8 } from "fflate";
import { CANARY, makeFixture } from "./fixtures";

let fx: Awaited<ReturnType<typeof makeFixture>>;
beforeAll(async () => {
  fx = await makeFixture();
});
afterAll(async () => {
  await closeDb();
});

const leaks = (x: unknown) => JSON.stringify(x).toLowerCase().includes(CANARY);

/** Everything a page render can see for a given article, as the page would assemble it. */
async function pagePayload(v: Viewer, slug: string) {
  const view = await getArticleView(v, slug);
  if (!view) return null;
  const visibleIds = new Set([...view.linkTargets.byId.keys(), ...[...view.linkTargets.byTitle.values()].map((t) => t.id)]);
  return { ...view, blocks: view.blocks.map((b) => ({ ...b, content: sanitizeDocForViewer(b.content as PMNode, visibleIds) })) };
}

// Viewers are resolved lazily: describe.each runs before beforeAll builds the fixture.
const restricted: [string, () => Viewer][] = [
  ["anonymous visitor", () => ANONYMOUS],
  ["signed-in player", () => fx.player],
  ["editor in public preview", () => fx.previewing],
];

describe("positive controls (the canary exists for editors)", () => {
  it("editor sees DM-only article, sections, facts, edges", async () => {
    expect(leaks(await pagePayload(fx.editor, "test-waystation"))).toBe(true);
    expect(await getArticleBySlug(fx.editor, fx.secret.slug)).not.toBeNull();
    expect((await search(fx.editor, CANARY)).length).toBeGreaterThan(0);
    expect((await suggest(fx.editor, CANARY)).length).toBeGreaterThan(0);
    expect((await getNeighbourhood(fx.editor, "harlan"))!.nodes.some((n) => n.id === fx.secret.id)).toBe(true);
    expect(leaks(await buildExport(fx.editor))).toBe(true);
  });
});

describe.each(restricted)("no DM material for %s", (_label, getV) => {
  let v: Viewer;
  beforeAll(() => {
    v = getV();
  });
  it("article page payload", async () => {
    const p = await pagePayload(v, "test-waystation");
    expect(p).not.toBeNull();
    expect(leaks(p)).toBe(false);
    expect(p!.blocks.every((b) => b.visibility === "public")).toBe(true);
    expect(p!.facts.every((f) => f.visibility === "public")).toBe(true);
    expect(p!.relationships.every((r) => r.visibility === "public" && r.other.visibility === "public")).toBe(true);
    expect(p!.hidden).toBeNull(); // not even a count of hidden sections
  });

  it("public block's link to a DM-only article loses its target", async () => {
    const p = await pagePayload(v, "test-waystation");
    const json = JSON.stringify(p!.blocks);
    expect(json).not.toContain(fx.secret.id);
    expect(json).toContain("a quiet compact"); // the author's visible words remain
  });

  it("DM-only article is not found at all", async () => {
    expect(await getArticleView(v, fx.secret.slug)).toBeNull();
    expect(await getArticleBySlug(v, fx.secret.slug)).toBeNull();
  });

  it("seeded Harlan: DM goals hidden, public placeholders shown", async () => {
    const p = await pagePayload(v, "harlan");
    expect(JSON.stringify(p)).not.toContain("deeply committed");
    expect(p!.blocks.map((b) => b.heading)).toEqual(["Who they are", "Reputation"]);
  });

  it("search, including snippets", async () => {
    expect(await search(v, CANARY)).toEqual([]);
    expect(await search(v, "deeply committed")).toEqual([]);
    expect(await search(v, "Gorvan")).toEqual([]); // research pantheon notes are DM-only
    const hits = await search(v, "waystation");
    expect(hits.length).toBe(1);
    expect(leaks(hits)).toBe(false);
  });

  it("autocomplete", async () => {
    expect(await suggest(v, CANARY)).toEqual([]);
    expect(await suggest(v, "compact")).toEqual([]);
    expect((await suggest(v, "")).every((s) => s.visibility === "public")).toBe(true);
  });

  it("backlinks only count visible sections of visible articles", async () => {
    const back = await getBacklinks(v, fx.harlan);
    expect(back.map((b) => b.slug)).toEqual(["mercer-family"]); // not the secret, not the DM block in Test Waystation
  });

  it("graph: nodes and edges", async () => {
    for (const slug of ["harlan", "mercer-family", "test-waystation", "tallwater"]) {
      const g = await getNeighbourhood(v, slug);
      expect(leaks(g)).toBe(false);
      expect(g!.nodes.some((n) => n.id === fx.secret.id)).toBe(false);
      expect(g!.edges.every((e) => e.visibility === "public")).toBe(true);
      const ids = new Set(g!.nodes.map((n) => n.id));
      expect(g!.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
    }
    expect(await getNeighbourhood(v, fx.secret.slug)).toBeNull();
  });

  it("related entries and shared tags", async () => {
    const a = (await getArticleBySlug(fx.editor, "mercer-family"))!;
    const rel = await getRelated(v, a);
    expect(rel.some((r) => r.id === fx.secret.id)).toBe(false);
  });

  it("listings and category counts", async () => {
    const all = await listArticles(v);
    expect(all.every((a) => a.visibility === "public")).toBe(true);
    expect(leaks(all)).toBe(false);
    const counts = await categoryCounts(v);
    expect(counts.faiths).toBe(0); // Greg's pantheons are research, DM-only
    expect(counts.factions).toBe(0); // the secret compact
  });

  it("exports (JSON and Markdown)", async () => {
    const data = await buildExport(v);
    expect(data.scope).toBe("public");
    expect(leaks(data)).toBe(false);
    const zip = unzipSync(exportToMarkdownZip(data));
    for (const [name, bytes] of Object.entries(zip)) {
      expect(name.toLowerCase()).not.toContain(CANARY);
      expect(strFromU8(bytes).toLowerCase()).not.toContain(CANARY);
    }
  });

  it("editor-only reads refuse", async () => {
    if (v.role === "admin" || v.role === "editor") return; // preview is a read lens; editors can still open the editor
    expect(await getArticleForEditing(v, "harlan")).toBeNull();
    expect(await listRevisions(v, fx.harlan)).toEqual([]);
    expect(await ledgerOverview(v)).toBeNull();
  });
});

describe("public preview is exactly the visitor view", () => {
  it("every surface matches the anonymous result", async () => {
    for (const slug of ["uthandar", "tallwater", "mercer-family", "harlan", "test-waystation"]) {
      expect(await pagePayload(fx.previewing, slug)).toEqual(await pagePayload(ANONYMOUS, slug));
      expect(await getNeighbourhood(fx.previewing, slug)).toEqual(await getNeighbourhood(ANONYMOUS, slug));
    }
    expect(await search(fx.previewing, "mercer")).toEqual(await search(ANONYMOUS, "mercer"));
    expect(await suggest(fx.previewing, "")).toEqual(await suggest(ANONYMOUS, ""));
    expect(await categoryCounts(fx.previewing)).toEqual(await categoryCounts(ANONYMOUS));
  });
});

describe("writes require an editor account", () => {
  const minimal = { title: "Intruder", type: "note", status: "draft", visibility: "public", blocks: [], facts: [], relationships: [] };
  it.each([
    ["anonymous", () => ANONYMOUS],
    ["player", () => fx.player],
  ])("%s cannot save, delete, or restore", async (_l, get) => {
    const v = get();
    await expect(saveArticle(v, minimal)).rejects.toBeInstanceOf(MutationError);
    await expect(deleteArticle(v, fx.harlan)).rejects.toBeInstanceOf(MutationError);
    await expect(restoreRevision(v, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(MutationError);
    expect(await getRevision(v, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("editing, links, revisions", () => {
  it("saves, rebuilds backlinks, records revisions, and restores after delete", async () => {
    const created = await saveArticle(fx.editor, {
      title: "Old Ford",
      type: "place",
      status: "draft",
      visibility: "public",
      blocks: [
        { heading: "Crossing", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "wikiLink", attrs: { id: null, title: "Tallwater", label: "the town" } }] }] }, visibility: "public", status: "draft", framing: "account" },
      ],
      facts: [],
      relationships: [],
    });
    const tallwater = (await getArticleBySlug(ANONYMOUS, "tallwater"))!;
    expect((await getBacklinks(ANONYMOUS, tallwater.id)).map((b) => b.slug)).toContain("old-ford");

    // edit: make the section DM-only — the public backlink must disappear
    const ed = (await getArticleForEditing(fx.editor, "old-ford"))!;
    await saveArticle(fx.editor, {
      id: ed.article.id,
      baseUpdatedAt: created.updatedAt,
      title: "Old Ford",
      type: "place",
      status: "draft",
      visibility: "public",
      blocks: [{ heading: "Crossing", content: ed.blocks[0].content, visibility: "dm", status: "draft", framing: "account" }],
      facts: [],
      relationships: [],
    });
    expect((await getBacklinks(ANONYMOUS, tallwater.id)).map((b) => b.slug)).not.toContain("old-ford");
    expect((await getBacklinks(fx.editor, tallwater.id)).map((b) => b.slug)).toContain("old-ford");

    // stale save is rejected
    await expect(
      saveArticle(fx.editor, { id: ed.article.id, baseUpdatedAt: created.updatedAt, title: "Old Ford", type: "place", status: "draft", visibility: "public", blocks: [], facts: [], relationships: [] }),
    ).rejects.toMatchObject({ status: 409 });

    const revs = await listRevisions(fx.editor, ed.article.id);
    expect(revs.map((r) => r.action)).toEqual(["update", "create"]);

    // restore the first revision: the section is public again
    await restoreRevision(fx.editor, revs[1].id);
    expect((await getBacklinks(ANONYMOUS, tallwater.id)).map((b) => b.slug)).toContain("old-ford");

    // delete and bring back
    await deleteArticle(fx.editor, ed.article.id);
    expect(await getArticleBySlug(fx.editor, "old-ford")).toBeNull();
    const overview = await ledgerOverview(fx.editor);
    const del = overview!.deleted.find((d) => d.article_id === ed.article.id)!;
    expect(del).toBeTruthy();
    await restoreRevision(fx.editor, del.id);
    expect(await getArticleBySlug(ANONYMOUS, "old-ford")).not.toBeNull();
  });

  it("strips unsafe content on save", async () => {
    const r = await saveArticle(fx.editor, {
      title: "Sanitize Test",
      type: "note",
      status: "draft",
      visibility: "dm",
      blocks: [
        {
          heading: null,
          visibility: "dm",
          status: "draft",
          framing: "account",
          content: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
              { type: "script", content: [{ type: "text", text: "x" }] },
              { type: "paragraph", content: [{ type: "wikiLink", attrs: { id: "00000000-0000-0000-0000-000000000000", title: "Nowhere" } }] },
            ],
          },
        },
      ],
      facts: [],
      relationships: [],
    });
    const ed = (await getArticleForEditing(fx.editor, r.slug))!;
    const json = JSON.stringify(ed.blocks[0].content);
    expect(json).not.toContain("javascript:");
    expect(json).not.toContain("script");
    expect(json).toContain('"id":null'); // bogus link target dropped
  });

  it("publication warning when a guide section links to a DM-only entry", async () => {
    const r = await saveArticle(fx.editor, {
      title: "Warning Test",
      type: "note",
      status: "draft",
      visibility: "public",
      blocks: [{ heading: null, visibility: "public", status: "draft", framing: "account", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "wikiLink", attrs: { id: fx.secret.id, title: "x", label: null } }] }] } }],
      facts: [],
      relationships: [],
    });
    expect(r.warnings.length).toBe(1);
  });
});

describe("starter import", () => {
  it("imports every note as DM-only, keeps status, resolves links by filename", async () => {
    const notes = await listArticles(fx.editor, { types: ["note", "culture", "faith", "history"] });
    const starter = notes.filter((n) => n.visibility === "dm");
    expect(starter.length).toBeGreaterThanOrEqual(24);
    const pantheon = (await getArticleView(fx.editor, "elven-pantheon-notes"))!;
    expect(pantheon.article.status).toBe("research");
    expect(pantheon.article.visibility).toBe("dm");
    expect(pantheon.blocks.every((b) => b.visibility === "dm")).toBe(true);
    const start = (await getArticleView(fx.editor, "00-start-here"))!;
    expect(JSON.stringify(start.blocks)).not.toContain("\\\\n");
    expect(start.linkTargets.byId.size + start.linkTargets.byTitle.size).toBeGreaterThan(10);
  });
});
