"use client";
import Link from "next/link";
import { useActionState } from "react";
import { checkInbox, snapshot, type InboxState, type SnapshotState } from "./actions";

const LABEL: Record<string, string> = { created: "New entry", proposed: "Added to entry", skipped: "Unchanged", error: "Not imported" };

export function CollabPanel() {
  const [inbox, runInbox, inboxPending] = useActionState<InboxState>(checkInbox, { ran: false, results: [], error: null });
  const [snap, runSnap, snapPending] = useActionState<SnapshotState>(snapshot, { ran: false, message: null, error: null });
  const fresh = inbox.results.filter((r) => r.outcome !== "skipped");
  return (
    <div className="ledger-cols">
      <section>
        <h3 className="side-h3">Check the inbox</h3>
        <p className="source-note">
          Imports Markdown files from <code>content/inbox/</code> (after you merge and pull on GitHub). Everything arrives as a DM-only proposal signed by its author.
        </p>
        <form action={runInbox}>
          <button className="btn btn-ledger" type="submit" disabled={inboxPending}>
            {inboxPending ? "Checking…" : "Check the inbox"}
          </button>
        </form>
        <div role="status" aria-live="polite">
          {inbox.error && <p className="form-error">{inbox.error}</p>}
          {inbox.ran && !inbox.error && (
            <>
              <p className="source-note" style={{ marginTop: "0.7rem" }}>
                {inbox.results.length === 0
                  ? "The inbox is empty."
                  : `${fresh.length} new or changed file(s), ${inbox.results.length - fresh.length} already imported.`}
              </p>
              <ul className="plain-list">
                {fresh.map((r) => (
                  <li key={r.file}>
                    <strong>{LABEL[r.outcome]}:</strong> {r.file}
                    {r.slug && (
                      <>
                        {" "}
                        (<Link href={`/a/${r.slug}`}>open</Link>)
                      </>
                    )}
                    <span className="hint">{r.detail}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
      <section>
        <h3 className="side-h3">Write a snapshot for collaborators</h3>
        <p className="source-note">
          Writes every entry, including DM material, as Markdown into <code>content/world/</code> so Vee and Claude can read the current state of the world from the repository. Keep the repository private.
        </p>
        <form action={runSnap}>
          <button className="btn" type="submit" disabled={snapPending}>
            {snapPending ? "Writing…" : "Write snapshot"}
          </button>
        </form>
        <div role="status" aria-live="polite">
          {snap.error && <p className="form-error">{snap.error}</p>}
          {snap.message && <p className="source-note" style={{ marginTop: "0.7rem" }}>{snap.message}</p>}
        </div>
      </section>
    </div>
  );
}
