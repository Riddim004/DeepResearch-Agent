"use client";

import type { HarnessEvent } from "@dossier/harness/browser";
import { ArrowRight, Check, Copy, Download, RefreshCw, SquareTerminal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { StatusPill } from "@/components/status-pill";
import { eventCategory, eventLabel, type TraceCategory } from "@/lib/event-labels";
import type { RunSummary, RunTraceResponse, StoredHarnessEvent } from "@/lib/types";
import { cn, formatDate, formatDuration, formatTime, truncateText } from "@/lib/utils";

const FILTERS: Array<{ id: "all" | TraceCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "pipeline", label: "Pipeline" },
  { id: "search", label: "Search" },
  { id: "source", label: "Sources" },
  { id: "report", label: "Report" },
  { id: "audit", label: "Audit" },
];

const DOT: Record<TraceCategory, string> = {
  pipeline: "bg-accent",
  search: "bg-amber",
  source: "bg-moss",
  report: "bg-ink-2",
  audit: "bg-accent-strong",
  run: "bg-faint",
};

function eventSummary(event: StoredHarnessEvent): string {
  return eventLabel(event.data as HarnessEvent);
}

export function TraceExplorer({
  runs,
  initialRunId,
}: {
  runs: RunSummary[];
  initialRunId?: string | null;
}) {
  const initial =
    initialRunId && runs.some((run) => run.id === initialRunId)
      ? initialRunId
      : (runs[0]?.id ?? null);
  const [runId, setRunId] = useState<string | null>(initial);
  const [trace, setTrace] = useState<RunTraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | TraceCategory>("all");
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!runId) return;
    const request = ++requestRef.current;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/runs/${runId}/trace`, { cache: "no-store" });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Trace request failed (HTTP ${response.status}).`);
        }
        const payload = (await response.json()) as RunTraceResponse;
        if (cancelled || request !== requestRef.current) return;
        setTrace(payload);
        setError(null);
        setSelectedSeq((current) => current ?? payload.events[0]?.seq ?? null);
      } catch (loadError) {
        if (cancelled || request !== requestRef.current) return;
        setError(loadError instanceof Error ? loadError.message : "The trace could not be loaded.");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [runId, reloadKey]);

  const status = trace?.run.status;
  useEffect(() => {
    if (status !== "running" && status !== "queued") return;
    const timer = setInterval(() => setReloadKey((value) => value + 1), 4_000);
    return () => clearInterval(timer);
  }, [status]);

  const events = useMemo(() => {
    const list = trace?.events ?? [];
    return filter === "all" ? list : list.filter((event) => eventCategory(event.type) === filter);
  }, [trace, filter]);

  const active =
    (selectedSeq !== null
      ? (trace?.events.find((event) => event.seq === selectedSeq) ?? null)
      : null) ??
    events[0] ??
    null;

  const selectedRun = runs.find((run) => run.id === runId) ?? null;
  const loading = !trace && !error;
  const summary = trace?.run ?? selectedRun;

  function chooseRun(id: string) {
    if (id === runId) return;
    setRunId(id);
    setTrace(null);
    setError(null);
    setFilter("all");
    setSelectedSeq(null);
    setCopied(false);
  }

  function refresh() {
    setTrace(null);
    setReloadKey((value) => value + 1);
  }

  async function copyTrace() {
    if (!trace) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1_800);
    } catch {
      // Clipboard access can be blocked; download remains available.
    }
  }

  async function copyEvent() {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(active.data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1_800);
    } catch {
      // Clipboard access can be blocked.
    }
  }

  function downloadTrace() {
    if (!trace) return;
    const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trace-${trace.run.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (runs.length === 0) {
    return (
      <div className="border border-line bg-paper-2 p-8 text-center sm:p-12">
        <SquareTerminal className="mx-auto size-6 text-accent" strokeWidth={1.5} />
        <h3 className="mt-4 font-serif text-2xl tracking-[-0.02em] text-ink">
          No traces stored yet.
        </h3>
        <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-muted">
          Start a research run and the harness will persist every typed event. The raw record will
          appear here, including searches that failed and sources that were skipped.
        </p>
        <Link href="/" className="btn btn-primary mt-6 gap-2">
          Start a run
          <ArrowRight className="size-3.5" strokeWidth={1.8} />
        </Link>
      </div>
    );
  }

  return (
    <div className="border border-line bg-paper shadow-[0_1px_0_rgba(25,23,18,0.04)]">
      <div className="grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-line bg-paper-2/60 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="label">Stored runs</span>
            <span className="font-mono text-[0.5625rem] text-faint">{runs.length}</span>
          </div>
          <div className="max-h-[20rem] overflow-y-auto lg:max-h-[34rem]">
            {runs.map((run) => {
              const activeRun = run.id === runId;
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => chooseRun(run.id)}
                  aria-pressed={activeRun}
                  className={cn(
                    "group flex w-full flex-col gap-1.5 border-b border-line px-4 py-3 text-left transition-colors last:border-b-0",
                    activeRun ? "bg-accent-soft/25" : "hover:bg-paper-3/60",
                  )}
                >
                  <span className="flex items-center justify-between gap-2 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint">
                    <span>{run.depth}</span>
                    <span>{formatDate(run.createdAt)}</span>
                  </span>
                  <span
                    className={cn(
                      "line-clamp-2 font-serif text-[0.9375rem] leading-snug tracking-[-0.01em]",
                      activeRun ? "text-ink" : "text-ink-2",
                    )}
                  >
                    {run.title ?? run.query}
                  </span>
                  <span className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-muted">
                    {run.status} · {run.sourceCount} sources
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-auto hidden border-t border-line px-4 py-3 lg:block">
            <p className="font-mono text-[0.5rem] leading-relaxed uppercase tracking-[0.08em] text-faint">
              node:sqlite · runs + events
              <br />
              persisted before they stream
            </p>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <StatusPill status={summary?.status ?? "queued"} />
                <span className="max-w-[24rem] truncate font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted">
                  {summary?.id ?? "—"}
                </span>
                <span className="text-faint">·</span>
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted">
                  {trace ? `${trace.events.length} events` : "loading"}
                </span>
                {trace?.run.stats ? (
                  <>
                    <span className="text-faint">·</span>
                    <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted">
                      {formatDuration(trace.run.stats.durationMs)} · {trace.run.stats.read} read ·{" "}
                      {trace.run.stats.usage.totalTokens.toLocaleString("en-US")} tokens
                    </span>
                  </>
                ) : null}
              </div>
              <p className="mt-1.5 line-clamp-1 text-[0.75rem] text-muted">
                {trace?.run.model ?? summary?.model ?? "Runtime model"} · every event below is
                persisted in order
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={refresh}
                className="btn btn-sm btn-quiet !h-8 !px-2"
                aria-label="Refresh trace"
                title="Refresh trace"
              >
                <RefreshCw
                  className={cn("size-3.5", loading && "animate-spin")}
                  strokeWidth={1.8}
                />
              </button>
              <button
                type="button"
                onClick={() => void copyTrace()}
                disabled={!trace}
                className="btn btn-sm btn-quiet !h-8 !px-2"
                aria-label="Copy trace JSON"
                title="Copy trace JSON"
              >
                {copied ? (
                  <Check className="size-3.5 text-moss" strokeWidth={2} />
                ) : (
                  <Copy className="size-3.5" strokeWidth={1.8} />
                )}
              </button>
              <button
                type="button"
                onClick={downloadTrace}
                disabled={!trace}
                className="btn btn-sm btn-quiet !h-8 !px-2"
                aria-label="Download trace JSON"
                title="Download trace JSON"
              >
                <Download className="size-3.5" strokeWidth={1.8} />
              </button>
            </div>
          </header>

          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="text-[0.8125rem] text-accent-strong">{error}</p>
              <button type="button" onClick={refresh} className="btn btn-sm gap-2">
                <RefreshCw className="size-3.5" strokeWidth={1.8} />
                Try again
              </button>
            </div>
          ) : loading ? (
            <div className="grid xl:grid-cols-[1.15fr_1fr]">
              <div className="space-y-2 border-b border-line px-4 py-4 xl:border-b-0 xl:border-r">
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={index}
                    className="h-9 animate-pulse border border-line bg-paper-2"
                    style={{ animationDelay: `${index * 70}ms` }}
                  />
                ))}
              </div>
              <div className="min-h-[20rem] bg-[#14120e] p-4">
                <div className="h-full min-h-[18rem] animate-pulse border border-white/10" />
              </div>
            </div>
          ) : (
            <div className="grid xl:grid-cols-[1.15fr_1fr]">
              <div className="min-w-0 border-b border-line xl:border-b-0 xl:border-r">
                <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
                  {FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setFilter(item.id);
                        setSelectedSeq(null);
                      }}
                      className={cn(
                        "rounded-full px-2.5 py-1 font-mono text-[0.5rem] uppercase tracking-[0.1em] transition-colors",
                        filter === item.id
                          ? "bg-ink text-paper"
                          : "text-muted hover:bg-paper-3 hover:text-ink",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                  <span className="ml-auto font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint">
                    {events.length}/{trace?.events.length ?? 0}
                  </span>
                </div>
                <div className="max-h-[34rem] overflow-y-auto">
                  {events.length === 0 ? (
                    <p className="px-4 py-10 text-center text-[0.75rem] text-muted">
                      No events in this category yet.
                    </p>
                  ) : (
                    events.map((event) => {
                      const activeEvent = active?.seq === event.seq;
                      const category = eventCategory(event.type);
                      return (
                        <button
                          key={event.seq}
                          type="button"
                          onClick={() => setSelectedSeq(event.seq)}
                          aria-pressed={activeEvent}
                          className={cn(
                            "grid w-full grid-cols-[2.6rem_minmax(0,1fr)_auto] items-start gap-2 border-b border-line/70 px-3 py-2.5 text-left transition-colors last:border-b-0",
                            activeEvent ? "bg-accent-soft/30" : "hover:bg-paper-2/70",
                          )}
                        >
                          <span className="font-mono text-[0.5625rem] text-faint">
                            {String(event.seq).padStart(3, "0")}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span
                                className={cn("size-1.5 flex-none rounded-full", DOT[category])}
                                aria-hidden
                              />
                              <span className="truncate font-mono text-[0.5625rem] uppercase tracking-[0.05em] text-ink-2">
                                {event.type}
                              </span>
                            </span>
                            <span className="mt-1 block truncate text-[0.6875rem] text-muted">
                              {truncateText(eventSummary(event), 150)}
                            </span>
                          </span>
                          <span className="font-mono text-[0.5rem] text-faint">
                            {formatTime(event.ts)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="min-w-0 bg-[#14120e] text-[#e9e2d3]">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-[#9d927e]">
                      Event data
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[0.625rem] text-[#e9e2d3]">
                      {active ? `#${String(active.seq).padStart(3, "0")} ${active.type}` : "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyEvent()}
                    disabled={!active}
                    className="flex h-7 items-center gap-1.5 border border-white/15 px-2 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[#c7bca7] transition-colors hover:border-white/30 hover:text-white"
                    aria-label="Copy event JSON"
                  >
                    {copied ? (
                      <Check className="size-3 text-[#9fd3a8]" strokeWidth={2} />
                    ) : (
                      <Copy className="size-3" strokeWidth={1.8} />
                    )}
                    Copy
                  </button>
                </div>
                <pre className="max-h-[30rem] overflow-auto p-4 font-mono text-[0.625rem] leading-[1.65] text-[#d9cfba]">
                  {active
                    ? JSON.stringify(active.data, null, 2)
                    : "Select an event to inspect its payload."}
                </pre>
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[#736a5a]">
                  <span>JSON · discriminated union</span>
                  <span>{trace?.run.status ?? "—"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
