"use client";

import type {
  AuditResult,
  HarnessEvent,
  Phase,
  ReportArtifact,
  ResearchBrief,
  RunStats,
  Source,
} from "@dossier/harness/browser";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { RunStatus, RunView, StoredHarnessEvent } from "@/lib/types";

type PhaseState = "pending" | "active" | "done";

export interface RunUiState {
  status: RunStatus;
  error: string | null;
  errorCode: string | null;
  brief: ResearchBrief | null;
  sources: Record<string, Source>;
  report: ReportArtifact | null;
  reportText: string;
  audit: AuditResult | null;
  stats: RunStats | null;
  phases: Record<Phase, PhaseState>;
  currentPhase: Phase | null;
  events: StoredHarnessEvent[];
  lastSeq: number;
  revision: number;
  title: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

type Action = { type: "event"; event: StoredHarnessEvent } | { type: "run"; run: RunView };

const PHASE_KEYS: Phase[] = ["scope", "discover", "read", "write", "audit"];

function emptyPhases(value: PhaseState = "pending"): Record<Phase, PhaseState> {
  return {
    scope: value,
    discover: value,
    read: value,
    write: value,
    audit: value,
  };
}

function mergeSource(sources: Record<string, Source>, incoming: Source): Record<string, Source> {
  const previous = sources[incoming.id];
  return {
    ...sources,
    [incoming.id]: {
      ...previous,
      ...incoming,
      number: incoming.number ?? previous?.number ?? null,
      ...(incoming.excerpt ? { excerpt: incoming.excerpt } : {}),
      ...(incoming.error ? { error: incoming.error } : {}),
    },
  };
}

function applyEvent(state: RunUiState, stored: StoredHarnessEvent): RunUiState {
  const event = stored.data as HarnessEvent;
  const next: RunUiState = {
    ...state,
    events: [...state.events, stored],
    lastSeq: Math.max(state.lastSeq, stored.seq),
  };

  switch (event.type) {
    case "run.started":
      return { ...next, status: "running", startedAt: next.startedAt ?? stored.ts };
    case "phase.started":
      return {
        ...next,
        currentPhase: event.phase,
        phases: { ...next.phases, [event.phase]: "active" },
      };
    case "phase.completed":
      return {
        ...next,
        currentPhase: next.currentPhase === event.phase ? null : next.currentPhase,
        phases: { ...next.phases, [event.phase]: "done" },
      };
    case "plan.created":
      return { ...next, brief: event.brief, title: next.title ?? event.brief.title };
    case "source.found":
      return { ...next, sources: mergeSource(next.sources, event.source) };
    case "source.reading": {
      const previous = next.sources[event.sourceId];
      if (!previous) return next;
      return {
        ...next,
        sources: {
          ...next.sources,
          [event.sourceId]: { ...previous, status: "reading" },
        },
      };
    }
    case "source.read":
      return {
        ...next,
        sources: mergeSource(next.sources, { ...event.source, status: "read" }),
      };
    case "source.failed": {
      const previous = next.sources[event.sourceId];
      if (!previous) return next;
      return {
        ...next,
        sources: {
          ...next.sources,
          [event.sourceId]: { ...previous, status: "failed", error: event.error },
        },
      };
    }
    case "context.built": {
      const sources = { ...next.sources };
      for (const citation of event.citations) {
        const source = sources[citation.sourceId];
        if (source) sources[citation.sourceId] = { ...source, number: citation.number };
      }
      return { ...next, sources };
    }
    case "report.started":
      return {
        ...next,
        reportText: "",
        report: null,
        audit: null,
        revision: event.revision,
        currentPhase: event.revision > 0 ? "audit" : "write",
        phases:
          event.revision > 0
            ? { ...next.phases, write: "done", audit: "active" }
            : { ...next.phases, write: "active" },
      };
    case "report.delta":
      return { ...next, reportText: next.reportText + event.text };
    case "report.snapshot":
      return { ...next, reportText: event.text };
    case "report.completed":
      return {
        ...next,
        report: event.report,
        reportText: event.report.markdown,
        revision: event.report.revision,
        title: event.report.title || next.title,
      };
    case "audit.started":
      return {
        ...next,
        currentPhase: "audit",
        phases: { ...next.phases, audit: "active" },
      };
    case "audit.completed":
      return { ...next, audit: event.audit };
    case "run.completed":
      return {
        ...next,
        status: "completed",
        stats: event.stats,
        title: event.title || next.title,
        currentPhase: null,
        phases: emptyPhases("done"),
        finishedAt: Date.parse(event.stats.finishedAt) || stored.ts,
      };
    case "run.failed":
      return {
        ...next,
        status: "failed",
        error: event.error,
        errorCode: event.code,
        currentPhase: null,
        finishedAt: stored.ts,
      };
    case "run.cancelled":
      return {
        ...next,
        status: "cancelled",
        currentPhase: null,
        finishedAt: stored.ts,
      };
    default:
      return next;
  }
}

function initialState(run: RunView, events: StoredHarnessEvent[]): RunUiState {
  const result = run.result;
  let state: RunUiState = {
    status: run.status,
    error: run.error,
    errorCode: run.errorCode,
    brief: result?.brief ?? null,
    sources: result ? Object.fromEntries(result.sources.map((source) => [source.id, source])) : {},
    report: result?.report ?? null,
    reportText: result?.report.markdown ?? "",
    audit: result?.audit ?? null,
    stats: run.stats ?? result?.stats ?? null,
    phases: emptyPhases(run.status === "completed" ? "done" : "pending"),
    currentPhase: run.currentPhase,
    events: [],
    lastSeq: 0,
    revision: result?.report.revision ?? 0,
    title: run.title,
    startedAt: run.startedAt ?? run.createdAt,
    finishedAt: run.finishedAt,
  };

  for (const event of events) state = applyEvent(state, event);

  if (!state.reportText && run.partialReport) {
    state = { ...state, reportText: run.partialReport };
  }
  if (result) {
    state = {
      ...state,
      brief: result.brief,
      sources: Object.fromEntries(result.sources.map((source) => [source.id, source])),
      report: result.report,
      reportText: result.report.markdown,
      audit: result.audit,
      stats: run.stats ?? result.stats,
      title: run.title ?? result.report.title,
      status: run.status === "completed" ? "completed" : state.status,
    };
  }
  return state;
}

function applyRun(state: RunUiState, run: RunView): RunUiState {
  const result = run.result;
  return {
    ...state,
    status: run.status,
    error: run.error,
    errorCode: run.errorCode,
    title: run.title ?? result?.report.title ?? state.title,
    stats: run.stats ?? result?.stats ?? state.stats,
    brief: result?.brief ?? state.brief,
    sources: result
      ? Object.fromEntries(result.sources.map((source) => [source.id, source]))
      : state.sources,
    report: result?.report ?? state.report,
    reportText:
      result?.report.markdown ??
      (run.partialReport && run.partialReport.length >= state.reportText.length
        ? run.partialReport
        : state.reportText),
    audit: result?.audit ?? state.audit,
    phases: run.status === "completed" ? emptyPhases("done") : state.phases,
    currentPhase: run.status === "running" ? run.currentPhase : null,
    startedAt: run.startedAt ?? state.startedAt,
    finishedAt: run.finishedAt ?? state.finishedAt,
  };
}

function reducer(state: RunUiState, action: Action): RunUiState {
  if (action.type === "event") return applyEvent(state, action.event);
  return applyRun(state, action.run);
}

function isTerminal(type: string): boolean {
  return type === "run.completed" || type === "run.failed" || type === "run.cancelled";
}

export function useRun(initialRun: RunView, initialEvents: StoredHarnessEvent[]) {
  const [state, dispatch] = useReducer(reducer, { initialRun, initialEvents }, (input) =>
    initialState(input.initialRun, input.initialEvents),
  );
  const [streaming, setStreaming] = useState(
    initialRun.status === "running" || initialRun.status === "queued",
  );
  const [connected, setConnected] = useState(false);
  const lastSeq = useRef(state.lastSeq);

  useEffect(() => {
    lastSeq.current = state.lastSeq;
  }, [state.lastSeq]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/runs/${initialRun.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { run?: RunView };
      if (data.run) dispatch({ type: "run", run: data.run });
    } catch {
      // The SSE stream remains the source of truth while the run is active.
    }
  }, [initialRun.id]);

  useEffect(() => {
    if (!streaming) return;
    let errors = 0;
    const source = new EventSource(`/api/runs/${initialRun.id}/events?after=${lastSeq.current}`);

    source.onopen = () => {
      errors = 0;
      setConnected(true);
    };

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as StoredHarnessEvent;
        dispatch({ type: "event", event });
        if (isTerminal(event.data.type)) {
          setStreaming(false);
          setConnected(false);
          source.close();
          void refresh();
        }
      } catch {
        // Ignore malformed keep-alive frames.
      }
    };

    source.onerror = () => {
      errors += 1;
      setConnected(false);
      if (errors > 8) {
        source.close();
        setStreaming(false);
        void refresh();
      }
    };

    return () => source.close();
  }, [streaming, initialRun.id, refresh]);

  const sources = useMemo(
    () =>
      Object.values(state.sources).sort((a, b) => {
        if (a.number !== null && b.number !== null) return a.number - b.number;
        if (a.number !== null) return -1;
        if (b.number !== null) return 1;
        const rank: Record<Source["status"], number> = {
          read: 0,
          reading: 1,
          found: 2,
          failed: 3,
          skipped: 4,
        };
        const diff = rank[a.status] - rank[b.status];
        return diff !== 0 ? diff : b.score - a.score;
      }),
    [state.sources],
  );

  const citationMap = useMemo(() => {
    const map = new Map<number, Source>();
    for (const source of sources) {
      if (source.number !== null) map.set(source.number, source);
    }
    return map;
  }, [sources]);

  return {
    state,
    sources,
    citationMap,
    streaming,
    connected,
    refresh,
    phases: state.phases,
    phaseKeys: PHASE_KEYS,
  };
}

export function useThrottledValue<T>(value: T, delay = 80): T {
  const [throttled, setThrottled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setThrottled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return throttled;
}
