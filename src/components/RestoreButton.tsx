"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RestoreButton({ revisionId, label = "Restore this version" }: { revisionId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await fetch(`/api/revisions/${revisionId}/restore`, { method: "POST" });
          const data = await r.json().catch(() => ({}));
          setBusy(false);
          if (!r.ok) return setError(data.error ?? "Restore failed.");
          router.push(`/a/${data.slug}`);
          router.refresh();
        }}
      >
        {busy ? "Restoring…" : label}
      </button>
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
