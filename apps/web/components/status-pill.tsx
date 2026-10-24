import { cn } from "@/lib/utils";
import type { RunStatus } from "@/lib/types";

const COPY: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Researching",
  completed: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function StatusPill({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.12em]",
        status === "running" && "border-accent/30 bg-accent-soft/70 text-accent-strong",
        status === "completed" && "border-moss/25 bg-moss-soft/70 text-moss",
        status === "failed" && "border-accent/30 bg-accent-soft/70 text-accent-strong",
        status === "cancelled" && "border-line bg-paper-3 text-muted",
        status === "queued" && "border-amber/25 bg-amber-soft/60 text-amber",
        className,
      )}
    >
      <span
        className={cn(
          "status-dot !size-[5px]",
          status === "running" && "status-dot-live",
          status === "completed" && "status-dot-ok",
          status === "failed" && "bg-accent",
          status === "queued" && "status-dot-warn",
        )}
      />
      {COPY[status]}
    </span>
  );
}
