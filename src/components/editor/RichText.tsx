"use client";
import { useEditor, EditorContent, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { WikiLink } from "./wikiLink";
import type { PMDoc } from "@/lib/doc";

function Tool({ on, label, pressed, children }: { on: () => void; label: string; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className="rt-tool" aria-label={label} title={label} aria-pressed={pressed} onMouseDown={(e) => e.preventDefault()} onClick={on}>
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h3: e.isActive("heading", { level: 3 }),
      ul: e.isActive("bulletList"),
      ol: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
    }),
  });
  return (
    <div className="rt-toolbar" role="toolbar" aria-label="Formatting">
      <Tool label="Bold (Ctrl+B)" pressed={s.bold} on={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </Tool>
      <Tool label="Italic (Ctrl+I)" pressed={s.italic} on={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </Tool>
      <Tool label="Subheading" pressed={s.h3} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H
      </Tool>
      <Tool label="Bulleted list" pressed={s.ul} on={() => editor.chain().focus().toggleBulletList().run()}>
        • List
      </Tool>
      <Tool label="Numbered list" pressed={s.ol} on={() => editor.chain().focus().toggleOrderedList().run()}>
        1. List
      </Tool>
      <Tool label="Quotation" pressed={s.quote} on={() => editor.chain().focus().toggleBlockquote().run()}>
        “ ”
      </Tool>
      <Tool label="Link to an entry (type [[ )" on={() => editor.chain().focus().insertContent("[[").run()}>
        [[ Link ]]
      </Tool>
    </div>
  );
}

export function RichText({ value, onChange, label, dm }: { value: PMDoc; onChange: (doc: PMDoc) => void; label: string; dm: boolean }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
        codeBlock: false,
      }),
      TableKit.configure({ table: { resizable: false } }),
      WikiLink,
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `rt-content prose ${dm ? "rt-dm" : ""}`,
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as PMDoc),
  });
  if (!editor) return <div className="rt-frame rt-loading">Loading editor…</div>;
  return (
    <div className="rt-frame">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
