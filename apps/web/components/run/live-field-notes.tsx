"use client";

import type { Phase, ResearchBrief, Source } from "@dossier/harness/browser";
import { AlertCircle, Check, FileText, Loader2, Search, Telescope } from "lucide-react";

import type { RunStatus, StoredHarnessEvent } from "@/lib/types";
import { cn, hostnameLabel, phaseLabel, truncateText } from "@/lib/utils";

interface SearchEntry {
  query: string;
  provider: string;
  status: "running" | "done" | "failed";
  count?: number;
  newCount?: number;
  durationMs?: number;
}

interface CoverageEntry {
  round: number;
  gaps: string[];
  queries: string[];
}

function deriveSearches(events: StoredHarnessEvent[]): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const stored of events) {
    const event = stored.data;
    if (event.type === "search.started") {
      entries.push({
        query: event.query,
        provider: event.provider,
        status: "running",
      });
    } else if (event.type === "search.completed") {
      const entry = [...entries].reverse().find((item) => item.query === event.query);
      if (entry) {
        entry.status = "done";
        entry.count = event.count;
        entry.newCount = event.newCount;
        entry.durationMs = event.durationMs;
      }
    } else if (event.type === "search.failed") {
      const entry = [...entries].reverse().find((item) => item.query === event.query);
      if (entry) entry.status = "failed";
    }
  }
  return entries;
}

function deriveCoverage(events: StoredHarnessEvent[]): CoverageEntry[] {
  return events
    .filter((stored) => stored.data.type === "coverage.assessed")
    .map((stored) => {
      const event = stored.data as Extract<
        StoredHarnessEvent["data"],
        { type: "coverage.assessed" }
      >;
      return { round: event.round, gaps: event.gaps, queries: event.followUpQueries };
    });
}

function activityCopy(phase: Phase | null, status: RunStatus): string {
  if (status === "queued") return "Queued. The harness will start in a moment.";
  switch (phase) {
    case "scope":
      return "Turning the question into a testable brief.";
    case "discover":
      return "Searching, deduplicating, and checking coverage.";
    case "read":
      return "Fetching and extracting the sources themselves.";
    case "write":
      return "Selecting evidence and drafting the brief.";
    case "audit":
      return "Checking whether each claim is supported by a citation.";
    default:
      return "Preparing the research desk.";
  }
}

export function LiveFieldNotes({
  brief,
  sources,
  events,
  currentPhase,
  status,
  elapsed,
  connected,
}: {
  brief: ResearchBrief | null;
  sources: Source[];
  events: StoredHarnessEvent[];
  currentPhase: Phase | null;
  status: RunStatus;
  elapsed: string;
  connected: boolean;
}) {
  const searches = deriveSearches(events);
  const coverage = deriveCoverage(events);
  const readSources = sources.filter((source) =>
    ["read", "reading", "failed"].includes(source.status),
  );
  const readCount = sources.filter((source) => source.status === "read").length;
  const foundCount = sources.length;
  const progress = foundCount === 0 ? 0 : Math.min(100, Math.round((readCount / foundCount) * 100));

  return (
    <div className="max-w-[48rem]">
      <div className="mb-8 flex items-center gap-3 border-y border-line py-3" aria-live="polite">
        <span
          className={cn("status-dot", status === "running" ? "status-dot-live" : "status-dot-warn")}
        />
        <span className="label label-strong flex-none">
          {status === "queued" ? "Queued" : phaseLabel(currentPhase ?? "scope")}
        </span>
        <span className="min-w-0 truncate text-[0.6875rem] text-muted">
          {!connected && status === "running"
            ? "Reconnecting to the event stream…"
            : activityCopy(currentPhase, status)}
        </span>
        <span className="ml-auto flex-none font-mono text-[0.625rem] tabular-nums text-muted">
          {elapsed}
        </span>
      </div>

      {brief ? (
        <section className="paper-card animate-rise overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
            <span className="label label-strong">Scoping memo</span>
            <span className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-faint">
              Plan / v1
            </span>
          </div>
          <div className="px-4 py-5 sm:px-5">
            <h2 className="font-serif text-[1.6rem] leading-tight tracking-[-0.025em] text-ink">
              {brief.title}
            </h2>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">{brief.restated}</p>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div>
                <span className="label">Subquestions</span>
                <ol className="mt-2.5 space-y-2">
                  {brief.subquestions.slice(0, 4).map((subquestion, index) => (
                    <li
                      key={subquestion.question}
                      className="flex gap-2.5 text-[0.75rem] leading-snug"
                    >
                      <span className="font-mono text-[0.5rem] text-accent">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-ink-2">{subquestion.question}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <span className="label">Search angles</span>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {brief.queries.slice(0, 6).map((query) => (
                    <span key={query.query} className="chip max-w-full" title={query.rationale}>
                      <span className="truncate">{query.query}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="paper-card p-5">
          <div className="flex items-center gap-2 text-muted">
            <Loader2 className="size-3.5 animate-spin" strokeWidth={1.8} />
            <span className="label">Scoping the question</span>
          </div>
          <div className="mt-5 space-y-3">
            <div className="skeleton h-7 w-4/5" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        </section>
      )}

      <section className="mt-8" aria-labelledby="search-log">
        <div className="flex items-end justify-between">
          <div>
            <span className="label">Search log</span>
            <h2
              id="search-log"
              className="mt-1 font-serif text-[1.35rem] tracking-[-0.02em] text-ink"
            >
              What the harness is looking for
            </h2>
          </div>
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-faint">
            {searches.length} {searches.length === 1 ? "query" : "queries"}
          </span>
        </div>

        <div className="mt-3 border-y border-line">
          {searches.length > 0
            ? searches.map((entry, index) => (
                <div
                  key={`${entry.query}-${index}`}
                  className="flex items-center gap-3 border-b border-line py-3 last:border-0"
                >
                  {entry.status === "running" ? (
                    <Loader2
                      className="size-3.5 flex-none animate-spin text-accent"
                      strokeWidth={1.8}
                    />
                  ) : entry.status === "failed" ? (
                    <AlertCircle className="size-3.5 flex-none text-accent" strokeWidth={1.8} />
                  ) : (
                    <Search className="size-3.5 flex-none text-muted" strokeWidth={1.7} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[0.75rem] text-ink-2">
                    {entry.query}
                  </span>
                  <span className="flex-none font-mono text-[0.5625rem] text-faint">
                    {entry.status === "running"
                      ? "searching"
                      : entry.status === "failed"
                        ? "failed"
                        : `${entry.count ?? 0} results · ${entry.newCount ?? 0} new`}
                  </span>
                </div>
              ))
            : brief?.queries.slice(0, 6).map((query) => (
                <div
                  key={query.query}
                  className="flex items-center gap-3 border-b border-line py-3 last:border-0"
                >
                  <Search className="size-3.5 flex-none text-faint" strokeWidth={1.7} />
                  <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted">
                    {query.query}
                  </span>
                  <span className="font-mono text-[0.5625rem] text-faint">queued</span>
                </div>
              ))}
        </div>
      </section>

      {coverage.length > 0 && (
        <section className="mt-8 space-y-3">
          {coverage.map((entry) => (
            <div key={entry.round} className="border border-line bg-paper-2 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Telescope className="size-3.5 text-accent" strokeWidth={1.7} />
                <span className="label label-strong">Coverage check · round {entry.round}</span>
              </div>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">
                {entry.gaps.length > 0
                  ? entry.gaps.join(" · ")
                  : "The evidence base is sufficient for this depth. Moving on."}
              </p>
              {entry.queries.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {entry.queries.map((query) => (
                    <span key={query} className="chip max-w-full !text-[0.5625rem]">
                      <span className="truncate">{query}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="mt-8" aria-labelledby="reading">
        <div className="flex items-end justify-between">
          <div>
            <span className="label">Reader</span>
            <h2 id="reading" className="mt-1 font-serif text-[1.35rem] tracking-[-0.02em] text-ink">
              Sources being read
            </h2>
          </div>
          <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-faint">
            {readCount} / {foundCount} read
          </span>
        </div>

        <div className="mt-3 h-1 w-full overflow-hidden bg-paper-3">
          <div
            className="h-full bg-moss transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-3 border-y border-line">
          {readSources.length > 0 ? (
            readSources.slice(0, 10).map((source) => (
              <div
                key={source.id}
                className="flex items-start gap-3 border-b border-line py-3 last:border-0"
              >
                <span className="mt-0.5 flex-none">
                  {source.status === "read" ? (
                    <Check className="size-3.5 text-moss" strokeWidth={2} />
                  ) : source.status === "failed" ? (
                    <AlertCircle className="size-3.5 text-accent" strokeWidth={1.8} />
                  ) : (
                    <Loader2 className="size-3.5 animate-spin text-amber" strokeWidth={1.8} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.75rem] leading-snug text-ink-2">{source.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint">
                    <span>{hostnameLabel(source.domain)}</span>
                    {source.wordCount ? (
                      <span>{source.wordCount.toLocaleString()} words</span>
                    ) : null}
                    {source.status === "failed" && source.error ? (
                      <span className="normal-case tracking-normal text-accent">
                        {truncateText(source.error, 90)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-3 py-6 text-muted">
              <FileText className="size-4" strokeWidth={1.6} />
              <span className="text-[0.75rem]">
                {foundCount > 0
                  ? "Selecting the strongest sources to read."
                  : "Waiting for the first search results."}
              </span>
            </div>
          )}
        </div>
        <p className="mt-3 text-[0.625rem] text-faint">
          This page is backed by a persisted event stream. You can leave and come back while the run
          continues.
        </p>
      </section>
    </div>
  );
}
