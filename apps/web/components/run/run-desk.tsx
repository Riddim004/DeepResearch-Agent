"use client";

import type { Source } from "@dossier/harness/browser";
import { AlertCircle, ArrowRight, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { RunView, StoredHarnessEvent } from "@/lib/types";
import { formatDuration, formatElapsed, phaseLabel } from "@/lib/utils";
import { AuditCard } from "./audit-card";
import { EvidencePanel, type EvidenceTab } from "./evidence-panel";
import { LiveFieldNotes } from "./live-field-notes";
import { PhaseRail } from "./phase-rail";
import { ReportView } from "./report-view";
import { RunHeader } from "./run-header";
import { SourceSheet } from "./source-sheet";
import { StatsStrip } from "./stats-strip";
import { useRun } from "./use-run";

function activityNote(phase: string | null): string {
  if (phase === "write") return "Selecting evidence and drafting the brief.";
  if (phase === "audit") return "Checking claims against cited sources.";
  if (phase === "read") return "Reading the sources in parallel.";
  if (phase === "discover") return "Searching and checking coverage.";
  if (phase === "scope") return "Scoping the question.";
  return "The harness is working.";
}

export function RunDesk({
  initialRun,
  initialEvents,
}: {
  initialRun: RunView;
  initialEvents: StoredHarnessEvent[];
}) {
  const { state, sources, citationMap, streaming, connected, refresh } = useRun(
    initialRun,
    initialEvents,
  );
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>("sources");

  useEffect(() => {
    if (state.status !== "running" && state.status !== "queued") return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [state.status]);

  const elapsed =
    state.status === "completed" && state.stats
      ? formatDuration(state.stats.durationMs)
      : formatElapsed(state.startedAt, state.finishedAt ?? now);

  const reportTitle = state.report?.title ?? state.title ?? state.brief?.title ?? initialRun.query;
  const showReport = state.reportText.trim().length > 0;
  const reportStreaming = state.status === "running" && state.report === null && showReport;
  const selectedSource: Source | null = selectedSourceId
    ? (state.sources[selectedSourceId] ?? null)
    : null;

  const handleCitation = useCallback(
    (number: number) => {
      const source = citationMap.get(number);
      if (!source) return;
      setSelectedSourceId(source.id);
      setEvidenceTab("sources");
      if (window.matchMedia("(max-width: 1023px)").matches) {
        setSheetOpen(true);
      } else {
        document
          .getElementById("evidence-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [citationMap],
  );

  async function cancelRun() {
    setCancelling(true);
    try {
      const response = await fetch(`/api/runs/${initialRun.id}/cancel`, { method: "POST" });
      if (!response.ok) setCancelling(false);
    } catch {
      setCancelling(false);
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <RunHeader
          runId={initialRun.id}
          query={initialRun.query}
          status={state.status}
          depth={initialRun.depth}
          model={initialRun.model}
          demo={initialRun.demo}
          createdAt={initialRun.createdAt}
          startedAt={state.startedAt}
          finishedAt={state.finishedAt}
          cancelling={cancelling}
          onCancel={() => void cancelRun()}
        />

        <div className="mt-4">
          <PhaseRail
            phases={state.phases}
            currentPhase={state.currentPhase}
            status={state.status}
            elapsed={elapsed}
          />
        </div>

        <div className="grid gap-10 pb-16 pt-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_400px]">
          <main className="min-w-0">
            {state.status === "failed" && (
              <div className="mb-8 border border-accent/30 bg-accent-soft/35 px-4 py-4">
                <div className="flex items-center gap-2 text-accent-strong">
                  <AlertCircle className="size-4" strokeWidth={1.8} />
                  <span className="label !text-accent-strong">
                    Run failed{state.errorCode ? ` · ${state.errorCode}` : ""}
                  </span>
                </div>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">{state.error}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/?q=${encodeURIComponent(initialRun.query)}`}
                    className="btn btn-sm gap-1.5"
                  >
                    Try again
                    <ArrowRight className="size-3" strokeWidth={1.8} />
                  </Link>
                  <a
                    href="#evidence-panel"
                    className="text-[0.6875rem] text-muted underline underline-offset-4 hover:text-ink"
                  >
                    Inspect the trace
                  </a>
                </div>
              </div>
            )}

            {state.status === "cancelled" && (
              <div className="mb-8 border border-line bg-paper-2 px-4 py-4">
                <div className="flex items-center gap-2 text-muted">
                  <span className="status-dot" />
                  <span className="label">Run cancelled</span>
                </div>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
                  The harness stopped before finishing. Any partial report below is preserved.
                </p>
              </div>
            )}

            {state.status === "running" && showReport && (
              <div className="mb-6 flex flex-wrap items-center gap-2.5 border-b border-line pb-3 text-[0.6875rem] text-muted">
                <span className="status-dot status-dot-live" />
                <span className="label">{phaseLabel(state.currentPhase ?? "write")}</span>
                <span>{activityNote(state.currentPhase)}</span>
                {!connected && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-amber">
                    <RotateCw className="size-3 animate-spin" strokeWidth={1.8} />
                    Reconnecting
                  </span>
                )}
              </div>
            )}

            {showReport ? (
              <ReportView
                markdown={state.reportText}
                title={reportTitle}
                sources={sources}
                streaming={Boolean(reportStreaming)}
                createdAt={initialRun.createdAt}
                onCitation={handleCitation}
              />
            ) : state.status === "completed" ? (
              <div className="paper-card p-6">
                <div className="flex items-center gap-2">
                  <AlertCircle className="size-4 text-amber" strokeWidth={1.8} />
                  <span className="label">Report unavailable</span>
                </div>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
                  The run completed, but the report could not be loaded from the event stream.
                </p>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="btn btn-sm mt-4 gap-1.5"
                >
                  <RotateCw className="size-3" strokeWidth={1.8} />
                  Reload run
                </button>
              </div>
            ) : (
              <LiveFieldNotes
                brief={state.brief}
                sources={sources}
                events={state.events}
                currentPhase={state.currentPhase}
                status={state.status}
                elapsed={elapsed}
                connected={connected}
              />
            )}

            {state.audit && <AuditCard audit={state.audit} />}
            {state.stats && (
              <StatsStrip
                stats={state.stats}
                citationCount={state.report?.citationCount ?? 0}
                demo={initialRun.demo}
              />
            )}

            {streaming && !showReport && (
              <p className="mt-6 flex items-center gap-2 text-[0.625rem] text-faint">
                <Loader2 className="size-3 animate-spin" strokeWidth={1.8} />
                Waiting for the writing phase. The trace is updating live.
              </p>
            )}
          </main>

          <aside
            id="evidence-panel"
            className="no-print min-w-0 lg:sticky lg:top-[126px] lg:self-start"
          >
            <EvidencePanel
              runId={initialRun.id}
              sources={sources}
              events={state.events}
              audit={state.audit}
              selectedSourceId={selectedSourceId}
              onSelect={(id) => setSelectedSourceId(id)}
              tab={evidenceTab}
              onTabChange={setEvidenceTab}
            />
          </aside>
        </div>
      </div>

      <SourceSheet source={sheetOpen ? selectedSource : null} onClose={() => setSheetOpen(false)} />
    </>
  );
}
