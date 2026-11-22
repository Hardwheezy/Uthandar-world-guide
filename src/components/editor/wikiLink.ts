/**
 * [[Wiki link]] inline node for Tiptap.
 *  - Type "[[" to open a picker of entries (server-filtered), or pick "new page".
 *  - Typing a complete [[Title]] or [[Title|label]] converts it too.
 * Stored as { type: "wikiLink", attrs: { id, title, label } }.
 */
import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { TYPE_LABEL, type ArticleType } from "@/lib/vocab";

type Item = { id: string | null; title: string; type?: string; visibility?: string; isNew?: boolean };

async function fetchItems(query: string): Promise<Item[]> {
  const q = query.trim();
  try {
    const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
    const data = (await r.json()) as { results: Item[] };
    const items: Item[] = data.results.map((x) => ({ ...x }));
    if (q && !items.some((i) => i.title.toLowerCase() === q.toLowerCase())) items.push({ id: null, title: q, isNew: true });
    return items;
  } catch {
    return q ? [{ id: null, title: q, isNew: true }] : [];
  }
}

function popup() {
  let el: HTMLDivElement;
  let unmount: (() => void) | undefined;
  let items: Item[] = [];
  let active = 0;
  let pick: (item: Item) => void = () => {};

  const draw = () => {
    el.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "wl-empty";
      empty.textContent = "Type a name to link to an entry";
      el.appendChild(empty);
      return;
    }
    items.forEach((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "wl-item";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(i === active));
      const name = document.createElement("span");
      name.textContent = it.isNew ? `New page: “${it.title}”` : it.title;
      const kind = document.createElement("span");
      kind.className = "wl-kind";
      kind.textContent = it.isNew ? "creates a red link" : `${TYPE_LABEL[it.type as ArticleType] ?? it.type ?? ""}${it.visibility === "dm" ? ", DM only" : ""}`;
      b.append(name, kind);
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(it);
      });
      el.appendChild(b);
    });
  };

  return {
    onStart: (props: SuggestionProps<Item>) => {
      el = document.createElement("div");
      el.className = "wl-popup";
      el.setAttribute("role", "listbox");
      el.setAttribute("aria-label", "Link to an entry");
      items = props.items;
      active = 0;
      pick = (it) => props.command(it);
      draw();
      unmount = props.mount(el);
    },
    onUpdate: (props: SuggestionProps<Item>) => {
      items = props.items;
      active = Math.min(active, Math.max(items.length - 1, 0));
      pick = (it) => props.command(it);
      draw();
    },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === "ArrowDown") {
        active = (active + 1) % Math.max(items.length, 1);
        draw();
        return true;
      }
      if (event.key === "ArrowUp") {
        active = (active - 1 + items.length) % Math.max(items.length, 1);
        draw();
        return true;
      }
      if ((event.key === "Enter" || event.key === "Tab") && items[active]) {
        pick(items[active]);
        return true;
      }
      if (event.key === "Escape") {
        unmount?.();
        return true;
      }
      return false;
    },
    onExit: () => {
      unmount?.();
    },
  };
}

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      title: { default: "" },
      label: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
        getAttrs: (el) => ({
          id: (el as HTMLElement).getAttribute("data-id") || null,
          title: (el as HTMLElement).getAttribute("data-title") ?? "",
          label: (el as HTMLElement).getAttribute("data-label") || null,
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-link": "",
        "data-id": node.attrs.id ?? "",
        "data-title": node.attrs.title,
        "data-label": node.attrs.label ?? "",
        class: node.attrs.id ? "wl" : "wl wl-missing",
        title: node.attrs.id ? `Links to ${node.attrs.title}` : `No entry called “${node.attrs.title}” yet`,
      }),
      node.attrs.label || node.attrs.title,
    ];
  },

  renderText({ node }) {
    return node.attrs.label || node.attrs.title;
  },

  addInputRules() {
    // Typing a complete [[Title]] or [[Title|shown text]] becomes a link.
    // (nodeInputRule would replace only the capture group and leave the brackets behind.)
    return [
      new InputRule({
        find: /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]$/,
        handler: ({ state, range, match }) => {
          const node = this.type.create({ id: null, title: match[1].trim(), label: match[2]?.trim() || null });
          state.tr.replaceWith(range.from, range.to, node);
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<Item>({
        pluginKey: new PluginKey("wikiLinkSuggest"),
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        startOfLine: false,
        allowedPrefixes: null,
        items: ({ query }) => fetchItems(query),
        command: ({ editor, range, props }) => {
          // Swallow a "]]" the user may already have typed after the cursor.
          const after = editor.state.doc.textBetween(range.to, Math.min(range.to + 2, editor.state.doc.content.size), "");
          const to = after === "]]" ? range.to + 2 : range.to;
          editor
            .chain()
            .focus()
            .insertContentAt({ from: range.from, to }, [
              { type: "wikiLink", attrs: { id: props.id, title: props.title, label: null } },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: popup,
      }),
    ];
  },
});
