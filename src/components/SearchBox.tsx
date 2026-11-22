"use client";
/** Search field with as-you-type suggestions (server-filtered by the viewer's permissions). */
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "./Icons";
import { TYPE_LABEL, type ArticleType } from "@/lib/vocab";

type Hit = { id: string; slug: string; title: string; type: string; visibility: string };

export function SearchBox({ hero = false, defaultValue = "", autoFocus = false }: { hero?: boolean; defaultValue?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (r.ok) {
          const data = (await r.json()) as { results: Hit[] };
          setHits(data.results);
          setActive(-1);
        }
      } catch {
        /* aborted */
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  // "/" focuses search from anywhere (unless typing in a field).
  useEffect(() => {
    if (hero) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hero]);

  const go = (hit?: Hit) => {
    setOpen(false);
    if (hit) router.push(`/a/${hit.slug}`);
    else if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const showList = open && hits.length > 0;
  return (
    <form
      role="search"
      className={`searchbox ${hero ? "searchbox-hero" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        go(active >= 0 ? hits[active] : undefined);
      }}
    >
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search the guide
      </label>
      <SearchIcon size={hero ? 18 : 15} />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        name="q"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={hero ? "Look up a place, person, or faith" : "Search the guide  ( / )"}
        value={q}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, -1));
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {showList && (
        <ul className="searchbox-list" role="listbox" id={listId}>
          {hits.map((h, i) => (
            <li
              key={h.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(h);
              }}
              onMouseEnter={() => setActive(i)}
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
    </form>
  );
}
