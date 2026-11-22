"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ items }: { items: { href: string; label: string; ledger?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Guide sections">
      {items.map((it) => {
        const current = it.href === "/" ? path === "/" : path === it.href || path.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href} aria-current={current ? "page" : undefined} className={it.ledger ? "ledger-link" : undefined}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
