"use server";
import { getViewer } from "@/lib/viewer";
import { isEditor } from "@/lib/access";
import { importInbox, writeSnapshot, type InboxResult } from "@/lib/inbox";

export type InboxState = { ran: boolean; results: InboxResult[]; error: string | null };
export type SnapshotState = { ran: boolean; message: string | null; error: string | null };

export async function checkInbox(_prev: InboxState): Promise<InboxState> {
  const v = await getViewer();
  if (!isEditor(v) || v.preview) return { ran: true, results: [], error: "Sign in as the DM (and leave public preview) to import the inbox." };
  try {
    return { ran: true, results: await importInbox(v), error: null };
  } catch (e) {
    return { ran: true, results: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function snapshot(_prev: SnapshotState): Promise<SnapshotState> {
  const v = await getViewer();
  if (!isEditor(v) || v.preview) return { ran: true, message: null, error: "Sign in as the DM (and leave public preview) to write a snapshot." };
  try {
    const r = await writeSnapshot(v);
    return { ran: true, message: `Wrote ${r.written} files to content/world/${r.removed ? `, removed ${r.removed} stale file(s)` : ""}. Commit and push to share them.`, error: null };
  } catch (e) {
    return { ran: true, message: null, error: e instanceof Error ? e.message : String(e) };
  }
}
