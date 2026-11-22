"use client";
/**
 * One editor for every kind of entry. Sections, facts and connections each carry
 * their own audience (Guide / DM Ledger) and editorial status. Saves go to the
 * server, which re-checks permissions, cleans content, rebuilds links, and keeps a revision.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RichText } from "./RichText";
import { emptyDoc, isEmptyDoc, type PMDoc } from "@/lib/doc";
import {
  ARTICLE_TYPES,
  FRAMINGS,
  FRAMING_INFO,
  REL_TYPE_KEYS,
  RELATIONSHIP_TYPES,
  STATUSES,
  STATUS_INFO,
  TYPE_LABEL,
  type ArticleType,
  type FramingKind,
  type RelType,
  type Status,
  type Vis,
} from "@/lib/vocab";
import { TEMPLATES, getTemplate } from "@/lib/templates";

export type EditorBlock = { key: string; heading: string; content: PMDoc; visibility: Vis; status: Status; framing: FramingKind; source: string };
export type EditorFact = { key: string; label: string; value: string; visibility: Vis; status: Status; source: string };
export type EditorRel = { key: string; type: RelType; targetId: string; targetTitle: string; note: string; visibility: Vis; status: Status; source: string };
export type EditorInitial = {
  id: string | null;
  updatedAt: string | null;
  title: string;
  slug: string;
  type: ArticleType;
  summary: string;
  status: Status;
  visibility: Vis;
  template: string | null;
  tags: string;
  source: string;
  blocks: EditorBlock[];
  facts: EditorFact[];
  relationships: EditorRel[];
  incoming: { id: string; label: string; title: string; slug: string }[];
};

let keySeq = 0;
const k = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;

function fromTemplate(key: string) {
  const t = getTemplate(key);
  if (!t) return null;
  return {
    type: t.type,
    blocks: t.sections.map<EditorBlock>((s) => ({ key: k(), heading: s.heading, content: emptyDoc(), visibility: s.visibility, status: "draft", framing: "account", source: "" })),
    facts: t.facts.map<EditorFact>((f) => ({ key: k(), label: f.label, value: "", visibility: f.visibility, status: "draft", source: "" })),
  };
}

function AudienceToggle({ value, onChange, label }: { value: Vis; onChange: (v: Vis) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {(["public", "dm"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={`seg-btn ${value === v ? "on" : ""} ${v === "dm" ? "seg-dm" : ""}`}
          onClick={() => onChange(v)}
        >
          {v === "public" ? "Guide" : "DM Ledger"}
        </button>
      ))}
    </div>
  );
}

function StatusSelect({ value, onChange, label }: { value: Status; onChange: (s: Status) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Status)} className="compact-select" title={STATUS_INFO[value].help}>
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_INFO[s].label}
        </option>
      ))}
    </select>
  );
}

function TargetPicker({ onPick, excludeId }: { onPick: (t: { id: string; title: string }) => void; excludeId: string | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; title: string; type: string; visibility: string }[]>([]);
  useEffect(() => {
    if (!q.trim()) return setHits([]);
    const ctl = new AbortController();
    fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => setHits(d.results.filter((x: { id: string }) => x.id !== excludeId)))
      .catch(() => {});
    return () => ctl.abort();
  }, [q, excludeId]);
  return (
    <div className="searchbox" style={{ width: "100%" }}>
      <input type="text" placeholder="Find an entry to connect" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Connect to entry" />
      {hits.length > 0 && (
        <ul className="searchbox-list" role="listbox">
          {hits.map((h) => (
            <li
              key={h.id}
              role="option"
              aria-selected={false}
              tabIndex={0}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(h);
                setQ("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onPick(h);
                  setQ("");
                }
              }}
            >
              <span>{h.title}</span>
              <span className="kind">
                {TYPE_LABEL[h.type as ArticleType] ?? h.type}
                {h.visibility === "dm" ? ", DM only" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ArticleEditor({ initial }: { initial: EditorInitial }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "warn"; text: string; warnings?: string[] } | null>(null);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const isNew = !s.id;
  const latest = useRef(s);
  latest.current = s;

  const update = useCallback((patch: Partial<EditorInitial>) => {
    setS((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);
  const setBlock = (key: string, patch: Partial<EditorBlock>) => update({ blocks: latest.current.blocks.map((b) => (b.key === key ? { ...b, ...patch } : b)) });
  const setFact = (key: string, patch: Partial<EditorFact>) => update({ facts: latest.current.facts.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  const setRel = (key: string, patch: Partial<EditorRel>) => update({ relationships: latest.current.relationships.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const move = <T extends { key: string }>(list: T[], key: string, dir: -1 | 1) => {
    const i = list.findIndex((x) => x.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const payload = useCallback(() => {
    const x = latest.current;
    return {
      baseUpdatedAt: x.updatedAt ?? undefined,
      title: x.title,
      slug: slugTouched ? x.slug : undefined,
      type: x.type,
      summary: x.summary,
      status: x.status,
      visibility: x.visibility,
      template: x.template,
      tags: x.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      source: x.source,
      note: note || undefined,
      blocks: x.blocks.map((b) => ({ heading: b.heading, content: b.content, visibility: b.visibility, status: b.status, framing: b.framing, source: b.source })),
      facts: x.facts.filter((f) => f.label.trim()).map((f) => ({ label: f.label, value: f.value, visibility: f.visibility, status: f.status, source: f.source })),
      relationships: x.relationships.map((r) => ({ type: r.type, targetId: r.targetId, note: r.note, visibility: r.visibility, status: r.status, source: r.source })),
    };
  }, [note, slugTouched]);

  const save = useCallback(
    async (thenView = false) => {
      if (saving) return;
      if (!latest.current.title.trim()) {
        setMessage({ kind: "error", text: "Give the entry a title before saving." });
        return;
      }
      setSaving(true);
      setMessage(null);
      const id = latest.current.id;
      const r = await fetch(id ? `/api/articles/${id}` : "/api/articles", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      }).catch(() => null);
      setSaving(false);
      if (!r) return setMessage({ kind: "error", text: "Couldn't reach the server. Your changes are still here; try saving again." });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setMessage({ kind: "error", text: data.error ?? "Saving failed. Your changes are still here." });
      setDirty(false);
      setNote("");
      setS((prev) => ({ ...prev, id: data.id, slug: data.slug, updatedAt: data.updatedAt }));
      setSlugTouched(true);
      if (thenView && !data.warnings?.length) {
        router.push(`/a/${data.slug}`);
        router.refresh();
        return;
      }
      setMessage({ kind: data.warnings?.length ? "warn" : "ok", text: "Saved.", warnings: data.warnings });
      // Point the address bar at the saved entry without remounting the editor.
      if (!id) window.history.replaceState(null, "", `/a/${data.slug}/edit`);
    },
    [payload, router, saving],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const applyTemplate = (key: string) => {
    const t = fromTemplate(key);
    if (!t) return;
    update({ template: key, type: t.type, blocks: t.blocks, facts: t.facts });
  };

  const del = async () => {
    if (!s.id) return;
    const r = await fetch(`/api/articles/${s.id}`, { method: "DELETE" });
    if (r.ok) {
      setDirty(false);
      router.push("/ledger");
      router.refresh();
    } else setMessage({ kind: "error", text: (await r.json().catch(() => ({}))).error ?? "Delete failed." });
  };

  const hasWriting = s.blocks.some((b) => !isEmptyDoc(b.content));
  const dmCount = s.blocks.filter((b) => b.visibility === "dm").length + s.facts.filter((f) => f.visibility === "dm").length + s.relationships.filter((r) => r.visibility === "dm").length;

  return (
    <div className="editor">
      <div className="editor-bar" role="region" aria-label="Save">
        <div className="editor-bar-inner">
          <span className="editor-bar-title">
            {isNew ? "New entry" : <>Editing <Link href={`/a/${s.slug}`}>{initial.title}</Link></>}
          </span>
          <span className="editor-state" role="status" aria-live="polite">
            {saving ? "Saving…" : message?.kind === "error" ? "" : dirty ? "Unsaved changes" : message?.text ?? (isNew ? "" : "No changes")}
          </span>
          <button className="btn btn-quiet" type="button" onClick={() => router.push(s.id ? `/a/${s.slug}` : "/ledger")}>
            {dirty ? "Discard" : "Close"}
          </button>
          <button className="btn" type="button" onClick={() => save(true)} disabled={saving}>
            Save and view
          </button>
          <button className="btn btn-primary" type="button" onClick={() => save(false)} disabled={saving} title="Ctrl+S">
            Save
          </button>
        </div>
        {message?.kind === "error" && (
          <p className="form-error editor-msg" role="alert">
            {message.text}
          </p>
        )}
        {message?.warnings?.map((w) => (
          <p key={w} className="editor-warn" role="status">
            {w}
          </p>
        ))}
      </div>

      <div className="editor-grid">
        <div className="editor-main">
          {isNew && (
            <div className="template-row">
              <span>Start from:</span>
              {TEMPLATES.map((t) => (
                <button key={t.key} type="button" className={`chip ${s.template === t.key ? "on" : ""}`} onClick={() => applyTemplate(t.key)} disabled={hasWriting} title={hasWriting ? "Templates only apply before you start writing" : `Scaffold headings and facts for a ${t.label.toLowerCase()}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <label className="sr-only" htmlFor="ed-title">
            Title
          </label>
          <input
            id="ed-title"
            className="title-input"
            type="text"
            value={s.title}
            placeholder="Title of the entry"
            onChange={(e) => update({ title: e.target.value })}
            autoFocus={isNew && !initial.title}
          />
          <label className="field" style={{ marginTop: "0.8rem" }}>
            <span>At a glance</span>
            <textarea
              value={s.summary}
              rows={2}
              placeholder="One or two sentences: what this is and why it matters. Leave empty to show “To be established”."
              onChange={(e) => update({ summary: e.target.value })}
            />
            <small>Visitors see this line whenever the entry itself is in the guide.</small>
          </label>

          <h2 className="editor-h2">Sections</h2>
          <p className="source-note">
            Guide sections are what visitors read. DM Ledger sections appear only to signed-in DMs, inside this same entry. Type <code>[[</code> to link another entry.
          </p>
          {s.blocks.length === 0 && <p className="empty-note">No sections yet. Add a guide section to start writing.</p>}
          {s.blocks.map((b, i) => (
            <section key={b.key} className={`ed-block ${b.visibility === "dm" ? "ed-block-dm" : ""}`} aria-label={`Section ${i + 1}${b.heading ? `: ${b.heading}` : ""}`}>
              <div className="ed-block-head">
                <input type="text" className="ed-heading" value={b.heading} placeholder={i === 0 ? "Heading (optional for the opening)" : "Heading"} aria-label="Section heading" onChange={(e) => setBlock(b.key, { heading: e.target.value })} />
                <AudienceToggle value={b.visibility} onChange={(v) => setBlock(b.key, { visibility: v })} label="Who can read this section" />
              </div>
              <div className="ed-block-meta">
                <label>
                  Status <StatusSelect value={b.status} onChange={(v) => setBlock(b.key, { status: v })} label="Section status" />
                </label>
                <label>
                  In-world framing
                  <select className="compact-select" value={b.framing} onChange={(e) => setBlock(b.key, { framing: e.target.value as FramingKind })}>
                    {FRAMINGS.map((f) => (
                      <option key={f} value={f}>
                        {FRAMING_INFO[f].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grow">
                  Source
                  <input type="text" value={b.source} placeholder="Where this came from" onChange={(e) => setBlock(b.key, { source: e.target.value })} />
                </label>
                <span className="ed-block-actions">
                  <button type="button" className="btn btn-quiet" aria-label="Move section up" disabled={i === 0} onClick={() => update({ blocks: move(s.blocks, b.key, -1) })}>
                    ↑
                  </button>
                  <button type="button" className="btn btn-quiet" aria-label="Move section down" disabled={i === s.blocks.length - 1} onClick={() => update({ blocks: move(s.blocks, b.key, 1) })}>
                    ↓
                  </button>
                  <button type="button" className="btn btn-quiet" aria-label="Remove section" onClick={() => update({ blocks: s.blocks.filter((x) => x.key !== b.key) })}>
                    Remove
                  </button>
                </span>
              </div>
              <RichText value={b.content} dm={b.visibility === "dm"} label={b.heading || `Section ${i + 1}`} onChange={(doc) => setBlock(b.key, { content: doc })} />
            </section>
          ))}
          <div className="add-row">
            <button type="button" className="btn" onClick={() => update({ blocks: [...s.blocks, { key: k(), heading: "", content: emptyDoc(), visibility: "public", status: "draft", framing: "account", source: "" }] })}>
              Add guide section
            </button>
            <button type="button" className="btn btn-ledger" onClick={() => update({ blocks: [...s.blocks, { key: k(), heading: "", content: emptyDoc(), visibility: "dm", status: "draft", framing: "account", source: "" }] })}>
              Add DM Ledger section
            </button>
          </div>
        </div>

        <aside className="editor-side">
          <section className="side-card">
            <h2>Entry</h2>
            <label className="field">
              <span>Kind of entry</span>
              <select value={s.type} onChange={(e) => update({ type: e.target.value as ArticleType })}>
                {ARTICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Who can read this entry</span>
              <AudienceToggle value={s.visibility} onChange={(v) => update({ visibility: v })} label="Who can read this entry" />
              <small>{s.visibility === "dm" ? "The whole entry is DM-only. Visitors get “not found”, even for sections marked Guide." : `In the guide. ${dmCount} DM-only ${dmCount === 1 ? "item stays" : "items stay"} hidden from visitors.`}</small>
            </div>
            <label className="field">
              <span>Editorial status</span>
              <StatusSelect value={s.status} onChange={(v) => update({ status: v })} label="Editorial status" />
              <small>{STATUS_INFO[s.status].help}</small>
            </label>
            <label className="field">
              <span>Address</span>
              <input
                type="text"
                value={s.slug}
                placeholder="made from the title"
                onChange={(e) => {
                  setSlugTouched(true);
                  update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") });
                }}
              />
              <small>/a/{s.slug || "…"}</small>
            </label>
            <label className="field">
              <span>Tags (DM only)</span>
              <input type="text" value={s.tags} placeholder="comma, separated" onChange={(e) => update({ tags: e.target.value })} />
            </label>
            <label className="field">
              <span>Source and approval (DM only)</span>
              <textarea rows={2} value={s.source} placeholder="Who decided this, and where it came from" onChange={(e) => update({ source: e.target.value })} />
            </label>
          </section>

          <section className="side-card">
            <h2>At-a-glance facts</h2>
            {s.facts.length === 0 && <p className="empty-note">No facts. Empty values show as “To be established”.</p>}
            {s.facts.map((f, i) => (
              <div key={f.key} className={`fact-row ${f.visibility === "dm" ? "fact-row-dm" : ""}`}>
                <input type="text" value={f.label} placeholder="Label" aria-label={`Fact ${i + 1} label`} onChange={(e) => setFact(f.key, { label: e.target.value })} />
                <input type="text" value={f.value} placeholder="To be established" aria-label={`Fact ${i + 1} value`} onChange={(e) => setFact(f.key, { value: e.target.value })} />
                <div className="fact-row-meta">
                  <AudienceToggle value={f.visibility} onChange={(v) => setFact(f.key, { visibility: v })} label={`Who can read fact ${i + 1}`} />
                  <StatusSelect value={f.status} onChange={(v) => setFact(f.key, { status: v })} label={`Fact ${i + 1} status`} />
                  <button type="button" className="btn btn-quiet" aria-label={`Remove fact ${i + 1}`} onClick={() => update({ facts: s.facts.filter((x) => x.key !== f.key) })}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn" onClick={() => update({ facts: [...s.facts, { key: k(), label: "", value: "", visibility: "public", status: "draft", source: "" }] })}>
              Add fact
            </button>
          </section>

          <section className="side-card">
            <h2>Connections</h2>
            <p className="source-note">Typed relationships drive the story web. Each has its own audience and status.</p>
            {s.relationships.map((r, i) => (
              <div key={r.key} className={`fact-row ${r.visibility === "dm" ? "fact-row-dm" : ""}`}>
                <div className="rel-sentence">
                  <span>{s.title || "This entry"}</span>
                  <select aria-label={`Connection ${i + 1} type`} className="compact-select" value={r.type} onChange={(e) => setRel(r.key, { type: e.target.value as RelType })}>
                    {REL_TYPE_KEYS.map((t) => (
                      <option key={t} value={t}>
                        {RELATIONSHIP_TYPES[t].label}
                      </option>
                    ))}
                  </select>
                  <strong>{r.targetTitle}</strong>
                </div>
                <input type="text" value={r.note} placeholder="Note (optional)" aria-label={`Connection ${i + 1} note`} onChange={(e) => setRel(r.key, { note: e.target.value })} />
                <div className="fact-row-meta">
                  <AudienceToggle value={r.visibility} onChange={(v) => setRel(r.key, { visibility: v })} label={`Who can see connection ${i + 1}`} />
                  <StatusSelect value={r.status} onChange={(v) => setRel(r.key, { status: v })} label={`Connection ${i + 1} status`} />
                  <button type="button" className="btn btn-quiet" aria-label={`Remove connection ${i + 1}`} onClick={() => update({ relationships: s.relationships.filter((x) => x.key !== r.key) })}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <TargetPicker
              excludeId={s.id}
              onPick={(t) =>
                update({
                  relationships: [...latest.current.relationships, { key: k(), type: "related_to", targetId: t.id, targetTitle: t.title, note: "", visibility: "public", status: "draft", source: "" }],
                })
              }
            />
            {s.incoming.length > 0 && (
              <>
                <h3 className="side-h3">Pointing here</h3>
                <ul className="plain-list">
                  {s.incoming.map((x) => (
                    <li key={x.id}>
                      <Link href={`/a/${x.slug}/edit`}>{x.title}</Link> <span className="hint">{x.label} this entry</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="side-card">
            <h2>Save note</h2>
            <label className="field">
              <span>What changed (optional)</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown in the history" />
            </label>
          </section>

          {s.id && (
            <section className="side-card">
              <h2>Delete</h2>
              {confirmDelete ? (
                <div className="field">
                  <span>Delete this entry? It can be restored from the DM Ledger afterwards.</span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className="btn btn-danger" onClick={del}>
                      Delete entry
                    </button>
                    <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                  Delete entry…
                </button>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
