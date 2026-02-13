"use client";

export function RescanButton({
  isPending,
  onClick
}: {
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <button className="button" onClick={onClick} disabled={isPending}>
      {isPending ? "Rescanning..." : "Rescan"}
    </button>
  );
}
