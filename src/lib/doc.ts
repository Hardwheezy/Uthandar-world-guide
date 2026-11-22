/**
 * Helpers for the ProseMirror/Tiptap JSON stored in article_blocks.content.
 * Isomorphic and dependency-free.
 */

export type PMMark = { type: string; attrs?: Record<string, unknown> };
export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
};
export type PMDoc = PMNode & { type: "doc" };

export type WikiLinkAttrs = { id: string | null; title: string; label: string | null };

export function emptyDoc(): PMDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function textDoc(...paragraphs: string[]): PMDoc {
  return {
    type: "doc",
    content: paragraphs.map((p) => ({ type: "paragraph", content: p ? [{ type: "text", text: p }] : undefined })),
  };
}

export function isDoc(v: unknown): v is PMDoc {
  return !!v && typeof v === "object" && (v as PMNode).type === "doc";
}

export function walk(node: PMNode, fn: (n: PMNode) => void) {
  fn(node);
  node.content?.forEach((c) => walk(c, fn));
}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "blockquote",
  "tableRow",
  "tableCell",
  "tableHeader",
  "codeBlock",
]);

export function docPlainText(doc: PMNode): string {
  const out: string[] = [];
  const rec = (n: PMNode) => {
    if (n.type === "text" && n.text) out.push(n.text);
    else if (n.type === "wikiLink") {
      const a = n.attrs as WikiLinkAttrs;
      out.push(a.label || a.title);
    } else if (n.type === "hardBreak") out.push("\n");
    n.content?.forEach(rec);
    if (BLOCK_TYPES.has(n.type)) out.push("\n");
  };
  rec(doc);
  return out
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractWikiLinks(doc: PMNode): WikiLinkAttrs[] {
  const links: WikiLinkAttrs[] = [];
  walk(doc, (n) => {
    if (n.type === "wikiLink" && n.attrs) {
      const a = n.attrs as WikiLinkAttrs;
      if (a.title) links.push({ id: a.id ?? null, title: String(a.title), label: (a.label as string) ?? null });
    }
  });
  return links;
}

/** Deep map over nodes (returns a new tree). */
export function mapDoc(node: PMNode, fn: (n: PMNode) => PMNode): PMNode {
  const mapped = fn({ ...node });
  if (mapped.content) mapped.content = mapped.content.map((c) => mapDoc(c, fn));
  return mapped;
}

/**
 * Strip link targets the viewer is not allowed to know about. The author-written
 * label stays (it is part of the visible text); the target id and title do not.
 */
export function sanitizeDocForViewer(doc: PMNode, visibleIds: Set<string>): PMNode {
  return mapDoc(doc, (n) => {
    if (n.type !== "wikiLink") return n;
    const a = n.attrs as WikiLinkAttrs;
    if (a.id && visibleIds.has(a.id)) return n;
    // Unresolved and hidden targets become indistinguishable: id-less, showing only the
    // text the author typed into this (visible) section.
    return { ...n, attrs: { id: null, title: a.label || a.title, label: null } };
  });
}

/** Hard size limits so a malformed save can't wedge the database. */
export const LIMITS = {
  title: 200,
  summary: 2000,
  heading: 200,
  factLabel: 120,
  factValue: 2000,
  source: 1000,
  blocks: 80,
  facts: 60,
  relationships: 100,
  docBytes: 400_000,
};

/** Only http(s), mailto, and same-site links survive. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h) || (h.startsWith("/") && !h.startsWith("//")) || h.startsWith("#")) return h;
  return null;
}

export function isEmptyDoc(doc: PMNode) {
  const hasContent = (n: PMNode): boolean =>
    (n.type === "text" && !!n.text?.trim()) || n.type === "wikiLink" || n.type === "horizontalRule" || !!n.content?.some(hasContent);
  return !hasContent(doc);
}
