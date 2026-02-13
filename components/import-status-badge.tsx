import type { ImportStatus } from "@/lib/types";

export function ImportStatusBadge({ status }: { status: ImportStatus | undefined }) {
  if (!status) {
    return <span className="badge badge-neutral">Loading import status...</span>;
  }

  const map: Record<ImportStatus["status"], { label: string; className: string }> = {
    idle: { label: "Idle", className: "badge-neutral" },
    running: { label: "Import running", className: "badge-running" },
    completed: { label: "Import completed", className: "badge-success" },
    completed_with_warnings: { label: "Completed with warnings", className: "badge-warning" },
    failed: { label: "Import failed", className: "badge-danger" }
  };

  const view = map[status.status];
  return (
    <span className={`badge ${view.className}`}>
      {view.label}
      {status.finishedAt ? ` · ${new Date(status.finishedAt).toLocaleString()}` : ""}
    </span>
  );
}
