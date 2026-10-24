import { Check } from "lucide-react";

import type { Phase } from "@dossier/harness/browser";
import type { RunStatus } from "@/lib/types";
import { cn, phaseLabel } from "@/lib/utils";

type PhaseState = "pending" | "active" | "done";

const PHASES: Phase[] = ["scope", "discover", "read", "write", "audit"];

export function PhaseRail({
  phases,
  currentPhase,
  status,
  elapsed,
}: {
  phases: Record<Phase, PhaseState>;
  currentPhase: Phase | null;
  status: RunStatus;
  elapsed: string;
}) {
  return (
    <div className="sticky top-16 z-30 border-y border-line bg-paper/88 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1440px] items-center gap-5 px-5 py-2.5 sm:px-8">
        <div className="thin-scroll flex min-w-0 flex-1 items-center overflow-x-auto">
          {PHASES.map((phase, index) => {
            const state = phases[phase];
            const active = state === "active" || currentPhase === phase;
            return (
              <div key={phase} className="flex min-w-0 flex-none items-center sm:flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-[22px] flex-none items-center justify-center rounded-full border font-mono text-[0.5625rem] transition-colors",
                      state === "done" && "border-moss/30 bg-moss-soft text-moss dark:bg-moss-soft",
                      active &&
                        state !== "done" &&
                        "border-accent/40 bg-accent-soft text-accent-strong",
                      state === "pending" && !active && "border-line bg-paper-2 text-faint",
                    )}
                  >
                    {state === "done" ? (
                      <Check className="size-3" strokeWidth={2.2} />
                    ) : active ? (
                      <span
                        className={cn(
                          "size-1.5 rounded-full bg-accent",
                          status === "running" && "animate-pulse",
                        )}
                      />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap text-[0.6875rem] transition-colors",
                      state === "done" && "text-ink-2",
                      active && state !== "done" && "text-ink",
                      state === "pending" && !active && "text-faint",
                    )}
                  >
                    {phaseLabel(phase)}
                  </span>
                </div>
                {index < PHASES.length - 1 && (
                  <span
                    className={cn(
                      "mx-2 hidden h-px min-w-4 flex-1 sm:block",
                      state === "done" ? "bg-line-strong" : "bg-line",
                    )}
                    aria-hidden
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-none items-center gap-2.5 border-l border-line pl-4 text-[0.625rem] text-muted">
          {status === "running" && <span className="status-dot status-dot-live" />}
          <span className="font-mono tabular-nums">{elapsed}</span>
        </div>
      </div>
    </div>
  );
}
