"use client";

import type { AuditResult, HarnessEvent, Source } from "@dossier/harness/browser";
import { ArrowUpRight, Download, FileText, Loader2, ScrollText } from "lucide-react";
import { useMemo } from "react";

import type { StoredHarnessEvent } from "@/lib/types";
import { cn, formatNumber, formatTime, hostnameLabel, truncateText } from "@/lib/utils";

export type EvidenceTab = "sources" | "trace";
type Tone = "default" | "ok" | "warn" | "error";

function sourceStatusLabel(source: Source): string {
  if (source.status === "read") return "read";
  if (source.status === "reading") return "reading";
  if (source.status === "failed") return "failed";
  if (source.status === "skipped") return "skipped";
  return "queued";
}

function SourceRow({
  source,
  selected,
  onSelect,
}: {
  source: Source;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "group relative border-b border-line transition-colors last:border-0",
        selected && "bg-accent-soft/25",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(source.id)}
        aria-pressed={selected}
        className="w-full px-3 py-3 pr-9 text-left"
      >
        <div className="flex gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-[3px] border font-mono text-[0.5rem]",
              source.number !== null
                ? "border-accent/35 bg-accent-soft text-accent-strong"
                : "border-line bg-paper text-faint",
            )}
          >
            {source.number !== null ? String(source.number).padStart(2, "0") : "—"}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "text-[0.75rem] leading-snug",
                source.status === "failed" ? "text-muted" : "text-ink-2",
              )}
            >
              {source.title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.5rem] uppercase tracking-[0.07em] text-faint">
              <span>{hostnameLabel(source.domain)}</span>
              <span className="text-line-strong">/</span>
              <span
                className={cn(
                  source.status === "read" && "text-moss",
                  source.status === "failed" && "text-accent",
                  source.status === "reading" && "text-amber",
                )}
              >
                {sourceStatusLabel(source)}
              </span>
              {source.wordCount ? (
                <>
                  <span className="text-line-strong">/</span>
                  <span>{formatNumber(source.wordCount)} words</span>
                </>
              ) : null}
            </div>
            {source.excerpt && (
              <p
                className={cn(
                  "mt-2 text-[0.6875rem] leading-relaxed text-muted",
                  selected ? "line-clamp-none" : "line-clamp-2",
                )}
              >
                {source.excerpt}
              </p>
            )}
            {source.error && (
              <p className="mt-1.5 text-[0.625rem] leading-relaxed text-accent">
                {truncateText(source.error, 120)}
              </p>
            )}
            {selected && source.accessedAt && (
              <p className="mt-2 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint">
                Accessed {new Date(source.accessedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </button>
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer noopener"
        className="absolute right-2 top-2.5 flex size-6 items-center justify-center rounded text-faint opacity-60 transition-all hover:bg-paper-3 hover:text-ink group-hover:opacity-100"
        aria-label={`Open ${hostnameLabel(source.domain)} in a new tab`}
      >
        <ArrowUpRight className="size-3.5" strokeWidth={1.7} />
      </a>
    </div>
  );
}

function summarize(event: HarnessEvent): { message: string; tone: Tone } {
  switch (event.type) {
    case "run.started":
      return { message: `Run started · ${event.model}`, tone: "default" };
    case "phase.started":
      return { message: event.label, tone: "default" };
    case "phase.completed":
      return { message: `${event.phase} completed`, tone: "ok" };
    case "plan.created":
      return { message: `Plan · ${event.brief.title}`, tone: "default" };
    case "search.started":
      return { message: `Search · ${event.query}`, tone: "default" };
    case "search.completed":
      return {
        message: `${event.count} results, ${event.newCount} new · ${event.durationMs}ms`,
        tone: "ok",
      };
    case "search.failed":
      return { message: `Search failed · ${event.error}`, tone: "error" };
    case "source.found":
      return { message: `Found · ${event.source.domain} — ${event.source.title}`, tone: "default" };
    case "source.reading":
      return { message: `Reading · ${event.title}`, tone: "default" };
    case "source.read":
      return { message: `Read · ${event.source.title}`, tone: "ok" };
    case "source.failed":
      return { message: `Read failed · ${event.title}`, tone: "error" };
    case "coverage.assessed":
      return {
        message: `Coverage · ${event.gaps.length} gaps, ${event.followUpQueries.length} follow-ups`,
        tone: "warn",
      };
    case "context.built":
      return {
        message: `Context · ${event.sources} sources, ${formatNumber(event.tokens)} tokens`,
        tone: "default",
      };
    case "report.started":
      return {
        message: event.revision > 0 ? `Revising draft ${event.revision}` : "Writing draft",
        tone: "default",
      };
    case "report.completed":
      return { message: `Draft complete · ${event.report.wordCount} words`, tone: "ok" };
    case "audit.started":
      return { message: "Citation audit started", tone: "default" };
    case "audit.completed":
      return {
        message: `Audit ${event.audit.score}/100 · ${event.audit.verdict}`,
        tone: event.audit.verdict === "pass" ? "ok" : "warn",
      };
    case "revision.started":
      return { message: "Revision triggered by audit", tone: "warn" };
    case "run.completed":
      return { message: "Run completed", tone: "ok" };
    case "run.failed":
      return { message: `Run failed · ${event.error}`, tone: "error" };
    case "run.cancelled":
      return { message: "Run cancelled", tone: "warn" };
    case "log":
      return { message: event.message, tone: event.level === "error" ? "error" : "warn" };
    default:
      return { message: event.type, tone: "default" };
  }
}

export function EvidencePanel({
  runId,
  sources,
  events,
  audit,
  selectedSourceId,
  onSelect,
  tab,
  onTabChange,
}: {
  runId: string;
  sources: Source[];
  events: StoredHarnessEvent[];
  audit: AuditResult | null;
  selectedSourceId: string | null;
  onSelect: (id: string) => void;
  tab: EvidenceTab;
  onTabChange: (tab: EvidenceTab) => void;
}) {
  const cited = sources.filter((source) => source.number !== null);
  const consulted = sources.filter((source) => source.number === null && source.status === "read");
  const failed = sources.filter((source) => source.status === "failed");
  const pending = sources.filter(
    (source) =>
      source.status === "found" || source.status === "reading" || source.status === "skipped",
  );
  const trace = useMemo(
    () =>
      events.filter(
        (event) => event.data.type !== "report.delta" && event.data.type !== "report.snapshot",
      ),
    [events],
  );

  function downloadTrace() {
    const blob = new Blob([JSON.stringify(trace, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trace-${runId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="paper-card flex flex-col overflow-hidden lg:max-h-[calc(100dvh-136px)]">
      <div className="border-b border-line px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="label label-strong">Evidence ledger</span>
            <p className="mt-1 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-faint">
              {cited.length} cited · {sources.length} discovered
            </p>
          </div>
          {audit && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em]",
                audit.verdict === "pass"
                  ? "border-moss/25 bg-moss-soft/60 text-moss"
                  : "border-amber/30 bg-amber-soft/60 text-amber",
              )}
            >
              {audit.score}/100
            </span>
          )}
        </div>

        <div className="mt-4 flex gap-5">
          {(
            [
              ["sources", `Sources ${sources.length}`],
              ["trace", `Trace ${trace.length}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value)}
              className={cn(
                "relative -mb-px border-b py-2 font-mono text-[0.5625rem] uppercase tracking-[0.1em] transition-colors",
                tab === value
                  ? "border-accent text-ink"
                  : "border-transparent text-faint hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === "sources" ? (
          <div>
            {sources.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <FileText className="size-5 text-faint" strokeWidth={1.5} />
                <p className="mt-3 text-[0.75rem] text-muted">
                  Sources will appear here as the harness discovers them.
                </p>
              </div>
            )}

            {[
              ["Cited sources", cited],
              ["Consulted", consulted],
              ["Still queued", pending],
              ["Unreadable", failed],
            ].map(([label, items]) =>
              (items as Source[]).length > 0 ? (
                <section key={label as string}>
                  <h3 className="sticky top-0 z-10 border-b border-line bg-paper-2/95 px-3 py-2 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-faint backdrop-blur">
                    {label as string} · {(items as Source[]).length}
                  </h3>
                  {(items as Source[]).map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      selected={source.id === selectedSourceId}
                      onSelect={onSelect}
                    />
                  ))}
                </section>
              ) : null,
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-faint">
                Typed event stream
              </span>
              <button
                type="button"
                onClick={downloadTrace}
                className="inline-flex items-center gap-1 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-muted transition-colors hover:text-ink"
              >
                <Download className="size-3" strokeWidth={1.8} />
                JSON
              </button>
            </div>

            {trace.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <ScrollText className="size-5 text-faint" strokeWidth={1.5} />
                <p className="mt-3 text-[0.75rem] text-muted">No events recorded yet.</p>
              </div>
            ) : (
              <ol className="px-3 py-2">
                {trace.map((stored) => {
                  const { message, tone } = summarize(stored.data);
                  return (
                    <li key={stored.seq} className="flex gap-2.5 py-1.5">
                      <span className="w-12 flex-none pt-0.5 font-mono text-[0.5rem] tabular-nums text-faint">
                        {formatTime(stored.ts)}
                      </span>
                      <span
                        className={cn(
                          "mt-[5px] size-1 flex-none rounded-full",
                          tone === "ok" && "bg-moss",
                          tone === "warn" && "bg-amber",
                          tone === "error" && "bg-accent",
                          tone === "default" && "bg-line-strong",
                        )}
                      />
                      <span
                        className={cn(
                          "min-w-0 break-words text-[0.625rem] leading-relaxed",
                          tone === "error" ? "text-accent" : "text-muted",
                        )}
                        title={stored.data.type}
                      >
                        {message}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            {trace.length > 0 && (
              <div className="flex items-center gap-2 border-t border-line px-3 py-2.5 text-[0.5625rem] text-faint">
                <Loader2 className="hidden size-3" />
                Report deltas are streamed but not persisted individually.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
