/**
 * Full-fidelity backup: every table except sessions, including password hashes.
 * Keep backup files private. For sharing content, use the JSON/Markdown exports instead.
 */
import { sql } from "drizzle-orm";
import type { DB } from "./client";
import * as s from "./schema";

const TABLES = [
  ["worlds", s.worlds],
  ["users", s.users],
  ["articles", s.articles],
  ["article_blocks", s.articleBlocks],
  ["article_facts", s.articleFacts],
  ["relationships", s.relationships],
  ["article_links", s.articleLinks],
  ["revisions", s.revisions],
  ["api_tokens", s.apiTokens],
  ["inbox_imports", s.inboxImports],
] as const;

const DATE_KEYS = new Set(["createdAt", "updatedAt", "expiresAt", "lastUsedAt", "revokedAt", "importedAt"]);

export async function dumpDatabase(db: DB) {
  const out: Record<string, unknown[]> = {};
  for (const [name, table] of TABLES) out[name] = await db.select().from(table);
  return { format: "uthandar-backup", version: 1, createdAt: new Date().toISOString(), tables: out };
}

export async function restoreDatabase(db: DB, dump: { format: string; tables: Record<string, Record<string, unknown>[]> }) {
  if (dump.format !== "uthandar-backup") throw new Error("Not an Uthandar backup file.");
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from articles`) as unknown as { rows: { n: number }[] }).rows;
  if (Number(n) > 0) throw new Error("Restore only runs into an empty database. Run `npm run db:reset -- --yes` and `npm run db:migrate` first.");
  await db.transaction(async (tx) => {
    for (const [name, table] of TABLES) {
      const rows = (dump.tables[name] ?? []).map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, DATE_KEYS.has(k) && typeof v === "string" ? new Date(v) : v])),
      );
      for (let i = 0; i < rows.length; i += 200) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.insert(table as any).values(rows.slice(i, i + 200) as any);
      }
    }
    await tx.execute(sql`select setval(pg_get_serial_sequence('article_links','id'), coalesce((select max(id) from article_links), 0) + 1, false)`);
    await tx.execute(sql`select setval(pg_get_serial_sequence('inbox_imports','id'), coalesce((select max(id) from inbox_imports), 0) + 1, false)`);
  });
}
