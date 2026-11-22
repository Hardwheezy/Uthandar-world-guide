/**
 * Collaborator (agent) guardrails: API keys and proposals.
 * An agent reads everything but can only ADD material, and everything it adds is
 * `proposed`, DM-only, and signed. It can never mark canon, publish, overwrite, or delete.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS, type Viewer } from "@/lib/access";
import { createApiToken, revokeApiToken, viewerFromApiKey } from "@/lib/auth";
import { saveArticle, proposeAdditions, deleteArticle, MutationError } from "@/lib/mutations";
import { getArticleView, getArticleForEditing, listRevisions } from "@/lib/queries";
import { closeDb } from "@/db/client";
import { makeFixture } from "./fixtures";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let vee: Viewer;
let rawKey: string;
beforeAll(async () => {
  fx = await makeFixture();
  const k = await createApiToken("Vee", "agent", fx.editor.userId);
  rawKey = k.token;
  vee = await viewerFromApiKey(rawKey);
});
afterAll(async () => {
  await closeDb();
});

describe("API keys", () => {
  it("resolve to a named agent", () => {
    expect(vee.role).toBe("agent");
    expect(vee.displayName).toBe("Vee");
  });
  it("unknown and malformed keys are anonymous", async () => {
    expect(await viewerFromApiKey("uth_notarealkey")).toEqual(ANONYMOUS);
    expect(await viewerFromApiKey("garbage")).toEqual(ANONYMOUS);
  });
  it("revoked keys stop working", async () => {
    const k = await createApiToken("Temp", "agent", null);
    expect((await viewerFromApiKey(k.token)).role).toBe("agent");
    await revokeApiToken(k.row.id);
    expect(await viewerFromApiKey(k.token)).toEqual(ANONYMOUS);
  });
});

describe("agent reads", () => {
  it("can read DM material for context", async () => {
    const v = await getArticleView(vee, "harlan");
    expect(JSON.stringify(v)).toContain("deeply committed");
  });
  it("cannot open the editor, history, or ledger", async () => {
    expect(await getArticleForEditing(vee, "harlan")).toBeNull();
    expect(await listRevisions(vee, fx.harlan)).toEqual([]);
  });
});

describe("agent writes are guarded", () => {
  it("new entries are forced to proposed + DM-only + signed, whatever was asked", async () => {
    const r = await saveArticle(vee, {
      title: "Reed Market",
      type: "place",
      status: "canon", // asked for canon…
      visibility: "public", // …and public
      summary: "A market.",
      source: "Vee's idea",
      blocks: [{ heading: "Stalls", markdown: "Traders from [[Tallwater]] sell **reeds** here.", visibility: "public", status: "canon", framing: "account" }],
      facts: [{ label: "Size", value: "Small", visibility: "public", status: "canon" }],
      relationships: [{ type: "located_in", targetId: (await getArticleView(fx.editor, "uthandar"))!.article.id, visibility: "public", status: "canon" }],
    });
    const e = (await getArticleForEditing(fx.editor, r.slug))!;
    expect(e.article.status).toBe("proposed");
    expect(e.article.visibility).toBe("dm");
    expect(e.article.source).toBe("Proposed by Vee via API. Vee's idea");
    expect(e.blocks.every((b) => b.status === "proposed" && b.visibility === "dm")).toBe(true);
    expect(e.facts.every((f) => f.status === "proposed" && f.visibility === "dm")).toBe(true);
    expect(e.outgoing.every((x) => x.status === "proposed" && x.visibility === "dm")).toBe(true);
    // Markdown was converted, including the wiki link
    expect(JSON.stringify(e.blocks[0].content)).toContain('"type":"wikiLink"');
    expect(JSON.stringify(e.blocks[0].content)).toContain('"type":"bold"');
    // a typed [[Title]] in NEW material resolves to the entry it names
    const tallwaterId = (await getArticleView(fx.editor, "tallwater"))!.article.id;
    expect(JSON.stringify(e.blocks[0].content)).toContain(`"id":"${tallwaterId}"`);
    // invisible to visitors
    expect(await getArticleView(ANONYMOUS, r.slug)).toBeNull();
    const revs = await listRevisions(fx.editor, e.article.id);
    expect(revs[0].by).toBe("Vee");
  });

  it("cannot overwrite or delete existing entries", async () => {
    const h = (await getArticleForEditing(fx.editor, "harlan"))!;
    await expect(
      saveArticle(vee, { id: h.article.id, title: "Harlan", type: "person", status: "canon", visibility: "public", blocks: [], facts: [], relationships: [] }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(deleteArticle(vee, h.article.id)).rejects.toBeInstanceOf(MutationError);
  });

  it("proposals append without touching existing content", async () => {
    const before = (await getArticleForEditing(fx.editor, "mercer-family"))!;
    const r = await proposeAdditions(vee, "mercer-family", {
      note: "Idea for their trade",
      blocks: [{ heading: "A thought on their trade", markdown: "Perhaps they run the ferries at [[Tallwater]].", visibility: "public", status: "canon" }],
      facts: [{ label: "Business", value: "Ferries?", visibility: "public", status: "canon" }],
    });
    expect(r.added).toEqual({ blocks: 1, facts: 1, relationships: 0 });
    const after = (await getArticleForEditing(fx.editor, "mercer-family"))!;
    expect(after.blocks.length).toBe(before.blocks.length + 1);
    // every pre-existing section is unchanged and in order
    before.blocks.forEach((b, i) => {
      expect(after.blocks[i].heading).toBe(b.heading);
      expect(after.blocks[i].content).toEqual(b.content);
      expect(after.blocks[i].status).toBe(b.status);
      expect(after.blocks[i].visibility).toBe(b.visibility);
    });
    const added = after.blocks[after.blocks.length - 1];
    expect(added.status).toBe("proposed");
    expect(added.visibility).toBe("dm");
    expect(added.source).toMatch(/^Proposed by Vee/);
    // the public page is unchanged for visitors
    const pub = await getArticleView(ANONYMOUS, "mercer-family");
    expect(JSON.stringify(pub)).not.toContain("ferries");
    // the existing public "Business: To be established" fact is still there and still public
    expect(after.facts.filter((f) => f.label === "Business").map((f) => [f.value, f.visibility])).toEqual([
      [null, "public"],
      ["Ferries?", "dm"],
    ]);
  });

  it("visitors and players cannot propose", async () => {
    await expect(proposeAdditions(ANONYMOUS, "harlan", { blocks: [{ heading: "x", markdown: "x", visibility: "dm", status: "draft" }] })).rejects.toMatchObject({ status: 403 });
    await expect(proposeAdditions(fx.player, "harlan", { blocks: [{ heading: "x", markdown: "x", visibility: "dm", status: "draft" }] })).rejects.toMatchObject({ status: 403 });
  });

  it("an editor key keeps the status it sends", async () => {
    const ed = await viewerFromApiKey((await createApiToken("Trusted", "editor", null)).token);
    const r = await proposeAdditions(ed, "tallwater", { facts: [{ label: "Editor fact", value: "x", visibility: "public", status: "draft" }] });
    expect(r.added.facts).toBe(1);
    const t = (await getArticleForEditing(fx.editor, "tallwater"))!;
    expect(t.facts.find((f) => f.label === "Editor fact")).toMatchObject({ visibility: "public", status: "draft" });
  });
});
