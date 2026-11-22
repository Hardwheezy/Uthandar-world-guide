/**
 * Markdown <-> ProseMirror JSON conversion (server/CLI only).
 * Used by the starter-wiki importer and the Markdown export.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { PMDoc, PMMark, PMNode, WikiLinkAttrs } from "./doc";

// ---- Markdown -> PM -------------------------------------------------------

type MdNode = {
  type: string;
  children?: MdNode[];
  value?: string;
  depth?: number;
  ordered?: boolean;
  url?: string;
  align?: unknown;
};

const WIKI_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

function textWithWikiLinks(value: string, marks: PMMark[]): PMNode[] {
  const out: PMNode[] = [];
  let last = 0;
  for (const m of value.matchAll(WIKI_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(textNode(value.slice(last, idx), marks));
    const attrs: WikiLinkAttrs = { id: null, title: m[1].trim(), label: m[2]?.trim() ?? null };
    out.push({ type: "wikiLink", attrs });
    last = idx + m[0].length;
  }
  if (last < value.length) out.push(textNode(value.slice(last), marks));
  return out.filter((n) => n.type !== "text" || n.text);
}

function textNode(text: string, marks: PMMark[]): PMNode {
  return marks.length ? { type: "text", text, marks } : { type: "text", text };
}

function inline(nodes: MdNode[] | undefined, marks: PMMark[] = []): PMNode[] {
  const out: PMNode[] = [];
  for (const n of nodes ?? []) {
    switch (n.type) {
      case "text":
        out.push(...textWithWikiLinks(n.value ?? "", marks));
        break;
      case "strong":
        out.push(...inline(n.children, [...marks, { type: "bold" }]));
        break;
      case "emphasis":
        out.push(...inline(n.children, [...marks, { type: "italic" }]));
        break;
      case "delete":
        out.push(...inline(n.children, [...marks, { type: "strike" }]));
        break;
      case "inlineCode":
        out.push(textNode(n.value ?? "", [...marks, { type: "code" }]));
        break;
      case "link":
        out.push(...inline(n.children, [...marks, { type: "link", attrs: { href: n.url } }]));
        break;
      case "break":
        out.push({ type: "hardBreak" });
        break;
      default:
        if (n.children) out.push(...inline(n.children, marks));
        else if (n.value) out.push(textNode(n.value, marks));
    }
  }
  // merge adjacent text nodes with identical marks
  const merged: PMNode[] = [];
  for (const n of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === "text" && n.type === "text" && JSON.stringify(prev.marks) === JSON.stringify(n.marks)) {
      prev.text += n.text ?? "";
    } else merged.push({ ...n });
  }
  return merged;
}

function para(children: PMNode[]): PMNode {
  return children.length ? { type: "paragraph", content: children } : { type: "paragraph" };
}

function block(n: MdNode): PMNode[] {
  switch (n.type) {
    case "paragraph":
      return [para(inline(n.children))];
    case "heading":
      return [{ type: "heading", attrs: { level: Math.min(Math.max((n.depth ?? 2) + 0, 2), 4) }, content: inline(n.children) }];
    case "list":
      return [
        {
          type: n.ordered ? "orderedList" : "bulletList",
          content: (n.children ?? []).map((li) => ({
            type: "listItem",
            content: (li.children ?? []).flatMap(block).length ? (li.children ?? []).flatMap(block) : [para([])],
          })),
        },
      ];
    case "blockquote":
      return [{ type: "blockquote", content: (n.children ?? []).flatMap(block) }];
    case "code":
      return [{ type: "codeBlock", content: n.value ? [{ type: "text", text: n.value }] : undefined }];
    case "thematicBreak":
      return [{ type: "horizontalRule" }];
    case "table": {
      const rows = n.children ?? [];
      return [
        {
          type: "table",
          content: rows.map((row, ri) => ({
            type: "tableRow",
            content: (row.children ?? []).map((cell) => ({
              type: ri === 0 ? "tableHeader" : "tableCell",
              content: [para(inline(cell.children))],
            })),
          })),
        },
      ];
    }
    case "html":
      return n.value?.trim() ? [para([{ type: "text", text: n.value }])] : [];
    default:
      return n.children ? n.children.flatMap(block) : [];
  }
}

export type MdSection = { heading: string | null; doc: PMDoc };

/** Whole Markdown string → one document (headings become subheadings inside the section). */
export function markdownToDoc(md: string): PMDoc {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(md) as unknown as MdNode;
  const content = (tree.children ?? []).flatMap((n) => (n.type === "heading" ? [{ type: "heading", attrs: { level: (n.depth ?? 3) <= 3 ? 3 : 4 }, content: inline(n.children) }] : block(n)));
  return { type: "doc", content: content.length ? content : [para([])] } as PMDoc;
}

/**
 * Parse Markdown into sections split on level-2 headings. A leading level-1
 * heading is returned separately (it usually duplicates the title).
 */
export function markdownToSections(md: string): { h1: string | null; sections: MdSection[] } {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(md) as unknown as MdNode;
  const children = tree.children ?? [];
  let h1: string | null = null;
  const sections: { heading: string | null; nodes: MdNode[] }[] = [{ heading: null, nodes: [] }];
  for (const n of children) {
    if (n.type === "heading" && n.depth === 1 && h1 === null && sections.length === 1 && sections[0].nodes.length === 0) {
      h1 = mdText(n);
      continue;
    }
    if (n.type === "heading" && n.depth === 2) {
      sections.push({ heading: mdText(n), nodes: [] });
      continue;
    }
    sections[sections.length - 1].nodes.push(n);
  }
  return {
    h1,
    sections: sections
      .filter((s) => s.heading !== null || s.nodes.length > 0)
      .map((s) => {
        const content = s.nodes.flatMap(block);
        return { heading: s.heading, doc: { type: "doc", content: content.length ? content : [para([])] } as PMDoc };
      }),
  };
}

function mdText(n: MdNode): string {
  if (n.value) return n.value;
  return (n.children ?? []).map(mdText).join("");
}

// ---- PM -> Markdown -------------------------------------------------------

export type LinkResolver = (attrs: WikiLinkAttrs) => string | null; // returns target title or null

function escapeMd(s: string) {
  return s.replace(/([\\`*_[\]])/g, "\\$1");
}

function inlineMd(nodes: PMNode[] | undefined, resolve: LinkResolver): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      if (n.type === "wikiLink") {
        const a = n.attrs as WikiLinkAttrs;
        const target = resolve(a);
        const shown = a.label || a.title;
        if (!target) return escapeMd(shown);
        return a.label && a.label !== target ? `[[${target}|${a.label}]]` : `[[${target}]]`;
      }
      if (n.type !== "text") return inlineMd(n.content, resolve);
      let t = (n.marks ?? []).some((m) => m.type === "code") ? `\`${n.text}\`` : escapeMd(n.text ?? "");
      for (const m of n.marks ?? []) {
        if (m.type === "bold") t = `**${t}**`;
        else if (m.type === "italic") t = `*${t}*`;
        else if (m.type === "strike") t = `~~${t}~~`;
        else if (m.type === "link") t = `[${t}](${String(m.attrs?.href ?? "")})`;
      }
      return t;
    })
    .join("");
}

function blockMd(n: PMNode, resolve: LinkResolver, indent = ""): string {
  switch (n.type) {
    case "paragraph":
      return indent + inlineMd(n.content, resolve);
    case "heading":
      return "#".repeat(Number(n.attrs?.level ?? 3)) + " " + inlineMd(n.content, resolve);
    case "bulletList":
    case "orderedList":
      return (n.content ?? [])
        .map((li, i) => {
          const bullet = n.type === "orderedList" ? `${i + 1}. ` : "- ";
          const inner = (li.content ?? []).map((c) => blockMd(c, resolve)).join("\n");
          return indent + bullet + inner.replace(/\n/g, "\n" + indent + "  ");
        })
        .join("\n");
    case "blockquote":
      return (n.content ?? []).map((c) => "> " + blockMd(c, resolve)).join("\n>\n");
    case "codeBlock":
      return "```\n" + (n.content ?? []).map((c) => c.text ?? "").join("") + "\n```";
    case "horizontalRule":
      return "---";
    case "table": {
      const rows = (n.content ?? []).map((r) =>
        (r.content ?? []).map((c) => (c.content ?? []).map((p) => inlineMd(p.content, resolve)).join(" ").replace(/\|/g, "\\|")),
      );
      if (!rows.length) return "";
      const head = `| ${rows[0].join(" | ")} |`;
      const sep = `| ${rows[0].map(() => "---").join(" | ")} |`;
      return [head, sep, ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`)].join("\n");
    }
    default:
      return (n.content ?? []).map((c) => blockMd(c, resolve)).join("\n\n");
  }
}

export function docToMarkdown(doc: PMNode, resolve: LinkResolver): string {
  return (doc.content ?? [])
    .map((n) => blockMd(n, resolve))
    .filter((s) => s.trim() !== "")
    .join("\n\n");
}
