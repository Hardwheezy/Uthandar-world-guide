import { STATUS_INFO, TBE, type Status } from "@/lib/vocab";

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const info = STATUS_INFO[status as Status];
  if (!info) return null;
  return (
    <span className={`badge badge-${status} ${className}`} title={info.help}>
      {info.label}
    </span>
  );
}

export function DmBadge() {
  return (
    <span className="badge badge-dm" title="Only DMs and editors can see this">
      DM only
    </span>
  );
}

export function Tbe({ text = TBE }: { text?: string }) {
  return <span className="tbe">{text}</span>;
}
