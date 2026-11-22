import Link from "next/link";
import type { ArticleCard } from "@/lib/queries";
import { TYPE_LABEL, type ArticleType } from "@/lib/vocab";
import { StatusBadge, DmBadge, Tbe } from "./Badges";

/** A-to-Z index, grouped by first letter. */
export function AZ({ items }: { items: ArticleCard[] }) {
  const groups = new Map<string, ArticleCard[]>();
  for (const a of items) {
    const ch = a.title.trim()[0]?.toUpperCase() ?? "#";
    const key = /[A-Z]/.test(ch) ? ch : "#";
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return (
    <div className="az">
      {[...groups.entries()].map(([letter, list]) => (
        <section key={letter} className="az-group" aria-label={letter}>
          <h2>{letter}</h2>
          <ul className="entry-list">
            {list.map((a) => (
              <li key={a.id}>
                <Link className="entry-title" href={`/a/${a.slug}`}>
                  {a.title}
                </Link>
                <div className="entry-meta">
                  <span>{TYPE_LABEL[a.type as ArticleType] ?? a.type}</span>
                  <StatusBadge status={a.status} />
                  {a.visibility === "dm" && <DmBadge />}
                </div>
                <p className="entry-summary">{a.summary ?? <Tbe />}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
