/** The GitHub shared inbox: Markdown files become guarded proposals; snapshots never touch hand-written files. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANONYMOUS } from "@/lib/access";
import { importInbox, writeSnapshot } from "@/lib/inbox";
import { getArticleForEditing, getArticleView, listRevisions } from "@/lib/queries";
import { closeDb } from "@/db/client";
import { makeFixture } from "./fixtures";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let dir: string;
const put = (name: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
};

beforeAll(async () => {
  fx = await makeFixture();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "uth-inbox-"));
});
afterAll(async () => {
  await closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("inbox import", () => {
  it("creates new entries and appends to existing ones, always as signed DM-only proposals", async () => {
    put(
      "vee-new-place.md",
      `---\ntitle: Salt Road Inn\nauthor: Vee\ntype: place\nsummary: A suggested waystation.\nfacts:\n  - label: Keeper\n    value:\nconnections:\n  - type: located_in\n    target: Tallwater\n---\n\n## Common room\n\nTravellers from [[Tallwater]] stop here.\n`,
    );
    put("claude-harlan.md", `---\ntitle: Harlan\nauthor: Claude\nnote: Questions to settle\n---\n\n## Open questions\n\n- What is the objective?\n`);
    put("_example.md", `---\ntitle: Ignored\nauthor: X\n---\n\n## X\n\nignored\n`);
    put("README.md", "# not an entry");

    const r = await importInbox(fx.editor, dir);
    expect(r.map((x) => [x.file, x.outcome])).toEqual([
      ["claude-harlan.md", "proposed"],
      ["vee-new-place.md", "created"],
    ]);

    const inn = (await getArticleForEditing(fx.editor, "salt-road-inn"))!;
    expect(inn.article).toMatchObject({ status: "proposed", visibility: "dm", type: "place" });
    expect(inn.article.source).toMatch(/^Proposed by Vee/);
    expect(inn.blocks.map((b) => [b.heading, b.status, b.visibility])).toEqual([["Common room", "proposed", "dm"]]);
    expect(inn.facts[0]).toMatchObject({ label: "Keeper", value: null, status: "proposed", visibility: "dm" });
    expect(inn.outgoing[0]).toMatchObject({ type: "located_in", targetTitle: "Tallwater", status: "proposed", visibility: "dm" });
    expect(await getArticleView(ANONYMOUS, "salt-road-inn")).toBeNull();

    const harlan = (await getArticleForEditing(fx.editor, "harlan"))!;
    const last = harlan.blocks[harlan.blocks.length - 1];
    expect(last).toMatchObject({ heading: "Open questions", status: "proposed", visibility: "dm" });
    expect(last.source).toMatch(/^Proposed by Claude/);
    // visitors' view of Harlan is unchanged
    expect(JSON.stringify(await getArticleView(ANONYMOUS, "harlan"))).not.toContain("Open questions");
    const revs = await listRevisions(fx.editor, harlan.article.id);
    expect(revs[0]).toMatchObject({ action: "proposal", by: "Claude" });
  });

  it("is idempotent, and an edited file arrives as a new round", async () => {
    const again = await importInbox(fx.editor, dir);
    expect(again.every((x) => x.outcome === "skipped")).toBe(true);
    const before = (await getArticleForEditing(fx.editor, "harlan"))!.blocks.length;
    put("claude-harlan.md", `---\ntitle: Harlan\nauthor: Claude\n---\n\n## Open questions\n\n- What is the objective?\n- Who knows about it?\n`);
    const r = await importInbox(fx.editor, dir);
    expect(r.find((x) => x.file === "claude-harlan.md")!.outcome).toBe("proposed");
    expect((await getArticleForEditing(fx.editor, "harlan"))!.blocks.length).toBe(before + 1);
  });

  it("reports problems per file without stopping the others", async () => {
    put("no-author.md", `---\ntitle: Nameless\n---\n\n## X\n\ntext\n`);
    put("bad-target.md", `---\ntitle: Tallwater\nauthor: Vee\nconnections:\n  - type: governs\n    target: Nowhere At All\n  - type: not_a_type\n    target: Harlan\nfacts:\n  - label: Note\n    value: x\n---\n`);
    const r = await importInbox(fx.editor, dir);
    expect(r.find((x) => x.file === "no-author.md")).toMatchObject({ outcome: "error" });
    const bad = r.find((x) => x.file === "bad-target.md")!;
    expect(bad.outcome).toBe("proposed");
    expect(bad.detail).toContain('connection target "Nowhere At All" not found');
    expect(bad.detail).toContain('unknown connection type "not_a_type"');
  });

  it("only an editor can import", async () => {
    await expect(importInbox(ANONYMOUS, dir)).rejects.toMatchObject({ status: 403 });
    await expect(importInbox(fx.player, dir)).rejects.toMatchObject({ status: 403 });
  });
});

describe("snapshot", () => {
  it("writes every entry and only ever removes files it generated", async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "uth-world-"));
    fs.writeFileSync(path.join(out, "hand-written.md"), "# mine, keep me");
    fs.writeFileSync(path.join(out, "old-generated.md"), "---\ngenerated: uthandar-snapshot\n---\nstale");
    const r = await writeSnapshot(fx.editor, out);
    expect(r.removed).toBe(1);
    expect(fs.existsSync(path.join(out, "hand-written.md"))).toBe(true);
    expect(fs.existsSync(path.join(out, "old-generated.md"))).toBe(false);
    const harlan = fs.readFileSync(path.join(out, "harlan.md"), "utf8");
    expect(harlan).toContain("deeply committed"); // DM material included: the repo must be private
    expect(harlan).toContain("[[Mercer family]]");
    expect(fs.readFileSync(path.join(out, "_index.md"), "utf8")).toContain("Keep the repository private");
    await expect(writeSnapshot(ANONYMOUS, out)).rejects.toMatchObject({ status: 403 });
    fs.rmSync(out, { recursive: true, force: true });
  });
});
