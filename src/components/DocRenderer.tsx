/**
 * Server-side renderer for stored ProseMirror JSON. Only known node types render.
 * Wiki links resolve against targets the viewer is allowed to see; anything else
 * becomes plain text (visitors) or a "create this page" link (editors).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { PMNode, WikiLinkAttrs } from "@/lib/doc";
import type { LinkTarget } from "@/lib/queries";
import { safeHref } from "@/lib/doc";

export type Targets = { byId: Map<string, LinkTarget>; byTitle: Map<string, LinkTarget> };

type Ctx = { targets: Targets; editor: boolean };

function marks(node: PMNode, child: ReactNode, key: string | number): ReactNode {
  let out = child;
  for (const m of node.marks ?? []) {
    if (m.type === "bold") out = <strong>{out}</strong>;
    else if (m.type === "italic") out = <em>{out}</em>;
    else if (m.type === "strike") out = <s>{out}</s>;
    else if (m.type === "underline") out = <u>{out}</u>;
    else if (m.type === "code") out = <code>{out}</code>;
    else if (m.type === "link") {
      const href = safeHref(m.attrs?.href);
      if (href) {
        const external = /^https?:/i.test(href);
        out = (
          <a href={href} {...(external ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}>
            {out}
          </a>
        );
      }
    }
  }
  return <span key={key}>{out}</span>;
}

function wikiLink(attrs: WikiLinkAttrs, ctx: Ctx, key: string | number): ReactNode {
  const text = attrs.label || attrs.title;
  const target = (attrs.id && ctx.targets.byId.get(attrs.id)) || (!attrs.id ? ctx.targets.byTitle.get(attrs.title.toLowerCase()) : undefined);
  if (target) {
    return (
      <Link key={key} href={`/a/${target.slug}`}>
        {text}
      </Link>
    );
  }
  if (ctx.editor && !attrs.id) {
    return (
      <Link key={key} href={`/new?title=${encodeURIComponent(attrs.title)}`} className="missing-link" title={`No entry called “${attrs.title}” yet. Create it.`}>
        {text}
      </Link>
    );
  }
  return <span key={key}>{text}</span>;
}

function render(node: PMNode, ctx: Ctx, key: string | number = 0): ReactNode {
  const kids = () => node.content?.map((c, i) => render(c, ctx, i));
  switch (node.type) {
    case "doc":
      return <>{kids()}</>;
    case "paragraph":
      return node.content?.length ? <p key={key}>{kids()}</p> : null;
    case "text":
      return marks(node, node.text, key);
    case "hardBreak":
      return <br key={key} />;
    case "wikiLink":
      return wikiLink(node.attrs as WikiLinkAttrs, ctx, key);
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 3, 3), 4);
      return level === 3 ? <h3 key={key}>{kids()}</h3> : <h4 key={key}>{kids()}</h4>;
    }
    case "bulletList":
      return <ul key={key}>{kids()}</ul>;
    case "orderedList":
      return <ol key={key}>{kids()}</ol>;
    case "listItem":
      return <li key={key}>{kids()}</li>;
    case "blockquote":
      return <blockquote key={key}>{kids()}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{node.content?.map((c) => c.text).join("")}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "table":
      return (
        <div key={key} style={{ overflowX: "auto" }}>
          <table>
            <tbody>{kids()}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr key={key}>{kids()}</tr>;
    case "tableHeader":
      return (
        <th key={key} scope="col">
          {kids()}
        </th>
      );
    case "tableCell":
      return <td key={key}>{kids()}</td>;
    default:
      return null;
  }
}

export { isEmptyDoc } from "@/lib/doc";

export function DocRenderer({ doc, targets, editor }: { doc: PMNode; targets: Targets; editor: boolean }) {
  return <>{render(doc, { targets, editor })}</>;
}
