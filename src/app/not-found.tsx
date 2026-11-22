import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty-state" style={{ margin: "2rem 0" }}>
      <p>
        <strong>That page isn&apos;t in the guide.</strong>
      </p>
      <p>
        It may have been renamed or removed, or it may never have been written. Search for it, or start from{" "}
        <Link href="/">the contents</Link>.
      </p>
    </div>
  );
}
