/**
 * THE access layer. Every read of world content takes a Viewer and filters in SQL.
 * Nothing DM-only is fetched for a viewer who can't see it, so nothing can leak
 * through rendering, JSON, search snippets, autocomplete, backlinks, or the graph.
 *
 * Roles:
 *   anonymous  — any visitor
 *   player     — signed in; sees the public guide (campaign-scoped access is future work)
 *   agent      — collaborator API key (e.g. Vee, Claude): reads everything, but can only
 *                create entries or PROPOSE additions, always as `proposed` + DM-only
 *   editor     — DM / editor; sees and edits everything
 *   admin      — editor + user management (future)
 *
 * "Public preview" is a read lens: an editor previewing sees exactly what anonymous sees.
 */
import { eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export type Role = "anonymous" | "player" | "agent" | "editor" | "admin";

export type Viewer = {
  userId: string | null;
  role: Role;
  displayName: string | null;
  /** Editor has switched on "view as a visitor". Downgrades reads only. */
  preview: boolean;
  /** How this viewer authenticated. API keys carry their own name in displayName. */
  via?: "session" | "token";
};

export const ANONYMOUS: Viewer = Object.freeze({ userId: null, role: "anonymous", displayName: null, preview: false });

/** May this viewer READ DM-only material right now? */
export function seesDm(v: Viewer): boolean {
  return (v.role === "editor" || v.role === "admin" || v.role === "agent") && !v.preview;
}

/** Does this account hold editing rights? (Mutations and the editor itself.) */
export function isEditor(v: Viewer): boolean {
  return v.role === "editor" || v.role === "admin";
}

/** May this viewer add new material (editors directly, collaborator keys as guarded proposals)? */
export function canPropose(v: Viewer): boolean {
  return isEditor(v) || v.role === "agent";
}

// ---- SQL predicates -------------------------------------------------------
// Each returns `undefined` (no restriction) for DM readers, or a `= 'public'`
// condition for everyone else. Column-based so they work on aliased tables.

export function visibleTo(v: Viewer, column: AnyPgColumn): SQL | undefined {
  return seesDm(v) ? undefined : eq(column, "public");
}

/** For hand-written SQL. `alias` must be a static table alias, never user input. */
export function visSql(v: Viewer, alias: string): SQL {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error("bad alias");
  return seesDm(v) ? sql.raw("true") : sql.raw(`${alias}.visibility = 'public'`);
}
