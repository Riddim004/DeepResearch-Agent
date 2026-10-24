import {
  DEPTH_PROFILES,
  HarnessError,
  errorMessage,
  isAbortError,
  runResearch,
  type HarnessEvent,
  type Phase,
} from "@dossier/harness";

import { redactSecrets, serverLogger } from "./logger";
import { MAX_CONCURRENT_RUNS, getRuntime } from "./server-config";
import { getStore } from "./store";
import type { CreateRunInput, RunRecord, RunSummary, RunView, StoredHarnessEvent } from "./types";

interface LiveRun {
  id: string;
  controller: AbortController;
  timeoutController: AbortController;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  events: StoredHarnessEvent[];
  listeners: Set<(event: StoredHarnessEvent) => void>;
  reportText: string;
  seq: number;
  terminal: boolean;
  startedAt: number;
  timedOut: boolean;
}

export class RunCapacityError extends Error {
  constructor() {
    super("The server is already running the maximum number of research jobs.");
    this.name = "RunCapacityError";
  }
}

function newRunId(): string {
  return `r_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;
}

function isTerminalEvent(event: HarnessEvent): boolean {
  return (
    event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled"
  );
}

function currentPhase(events: StoredHarnessEvent[]): Phase | null {
  const completed = new Set<Phase>();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]?.data;
    if (!event) continue;
    if (event.type === "phase.completed") completed.add(event.phase);
    if (event.type === "phase.started" && !completed.has(event.phase)) return event.phase;
  }
  return null;
}

export class RunManager {
  private readonly store = getStore();
  private readonly active = new Map<string, LiveRun>();

  runningCount(): number {
    let count = 0;
    for (const live of this.active.values()) {
      if (!live.terminal) count += 1;
    }
    return count;
  }

  create(input: CreateRunInput): RunRecord {
    if (this.runningCount() >= MAX_CONCURRENT_RUNS) throw new RunCapacityError();
    const runtime = getRuntime();
    const id = newRunId();
    const record = this.store.createRun({
      id,
      request: input,
      model: runtime.model,
      demo: runtime.demo,
    });

    const live: LiveRun = {
      id,
      controller: new AbortController(),
      timeoutController: new AbortController(),
      timeoutTimer: null,
      events: [],
      listeners: new Set(),
      reportText: "",
      seq: 0,
      terminal: false,
      startedAt: 0,
      timedOut: false,
    };
    this.active.set(id, live);
    void this.execute(live, input).catch((error) => {
      const message = redactSecrets(errorMessage(error));
      serverLogger.error("Run executor crashed unexpectedly", {
        runId: id,
        error: message,
      });
      if (live.terminal) return;
      try {
        this.store.failRun({
          id: live.id,
          status: "failed",
          error: message,
          errorCode: "INTERNAL",
          finishedAt: Date.now(),
          startedAt: live.startedAt || null,
        });
      } catch {
        // The storage layer is already failing; still notify the stream.
      }
      this.append(live, { type: "run.failed", error: message, code: "INTERNAL" });
      live.terminal = true;
      live.listeners.clear();
      this.schedulePrune(live);
    });
    return record;
  }

  getRunView(id: string): RunView | null {
    const record = this.store.getRun(id);
    if (!record) return null;
    const live = this.active.get(id);
    const events = live?.events ?? this.store.listEvents(id);
    return {
      ...record,
      partialReport: live?.reportText ?? record.report ?? "",
      currentPhase: currentPhase(events),
    };
  }

  getRun(id: string): RunRecord | null {
    return this.store.getRun(id);
  }

  listRuns(limit = 30): RunSummary[] {
    return this.store.listRuns(limit);
  }

  getLive(id: string): LiveRun | null {
    return this.active.get(id) ?? null;
  }

  eventsSince(id: string, afterSeq: number): StoredHarnessEvent[] {
    const live = this.active.get(id);
    if (live) return live.events.filter((event) => event.seq > afterSeq);
    return this.store.listEvents(id, afterSeq);
  }

  subscribe(id: string, listener: (event: StoredHarnessEvent) => void): (() => void) | null {
    const live = this.active.get(id);
    if (!live || live.terminal) return null;
    live.listeners.add(listener);
    return () => live.listeners.delete(listener);
  }

  partialReport(id: string): string {
    return this.active.get(id)?.reportText ?? "";
  }

  cancel(id: string): boolean {
    const live = this.active.get(id);
    if (!live || live.terminal) return false;
    live.controller.abort(new DOMException("Cancelled by user", "AbortError"));
    return true;
  }

  private async execute(live: LiveRun, input: CreateRunInput): Promise<void> {
    const runtime = getRuntime();
    const profile = DEPTH_PROFILES[input.depth];

    try {
      live.startedAt = Date.now();
      this.store.markRunning(live.id, live.startedAt);

      live.timeoutTimer = setTimeout(() => {
        live.timedOut = true;
        live.timeoutController.abort(new DOMException("Run time budget exceeded", "TimeoutError"));
      }, profile.timeoutMs);
      live.timeoutTimer.unref?.();

      const signal = AbortSignal.any([live.controller.signal, live.timeoutController.signal]);

      const result = await runResearch(
        {
          query: input.query,
          depth: input.depth,
          ...(input.language ? { language: input.language } : {}),
          ...(input.audience ? { audience: input.audience } : {}),
          ...(input.recencyDays ? { recencyDays: input.recencyDays } : {}),
        },
        {
          provider: runtime.provider,
          search: runtime.search,
          fetcher: runtime.fetcher,
          logger: serverLogger,
          demo: runtime.demo,
          pricing: runtime.pricing,
          signal,
          onEvent: (event) => this.append(live, event),
        },
      );

      const finishedAt = Date.now();
      const sourceCount = result.sources.filter((source) => source.status === "read").length;
      this.store.completeRun({
        id: live.id,
        title: result.report.title,
        report: result.report.markdown,
        result,
        stats: result.stats,
        sourceCount,
        finishedAt,
      });
      this.append(live, {
        type: "run.completed",
        stats: result.stats,
        title: result.report.title,
      });
      serverLogger.info("Run completed", {
        runId: live.id,
        durationMs: result.stats.durationMs,
        sources: sourceCount,
        tokens: result.stats.usage.totalTokens,
      });
    } catch (error) {
      this.handleFailure(live, error);
    } finally {
      if (live.timeoutTimer) clearTimeout(live.timeoutTimer);
      live.timeoutTimer = null;
      if (live.terminal) {
        live.listeners.clear();
        this.schedulePrune(live);
      }
    }
  }

  private handleFailure(live: LiveRun, error: unknown): void {
    const finishedAt = Date.now();
    const cancelled = !live.timedOut && (live.controller.signal.aborted || isAbortError(error));
    const code = live.timedOut
      ? "TIMEOUT"
      : cancelled
        ? "CANCELLED"
        : error instanceof HarnessError
          ? error.code
          : "INTERNAL";
    const message = live.timedOut
      ? "The run hit its time budget and was stopped."
      : cancelled
        ? "The run was cancelled."
        : redactSecrets(errorMessage(error));

    this.store.failRun({
      id: live.id,
      status: cancelled ? "cancelled" : "failed",
      error: message,
      errorCode: code,
      finishedAt,
      startedAt: live.startedAt || null,
    });

    if (cancelled) {
      this.append(live, { type: "run.cancelled" });
    } else {
      this.append(live, { type: "run.failed", error: message, code });
    }

    serverLogger[cancelled ? "info" : "warn"]("Run stopped", {
      runId: live.id,
      code,
      error: message,
    });
  }

  private append(live: LiveRun, event: HarnessEvent): void {
    if (live.terminal) return;

    if (event.type === "report.started") live.reportText = "";
    if (event.type === "report.snapshot") live.reportText = event.text;
    if (event.type === "report.delta") live.reportText += event.text;

    const stored: StoredHarnessEvent = {
      seq: live.seq + 1,
      ts: Date.now(),
      type: event.type,
      data: event,
    };
    live.seq += 1;
    live.events.push(stored);

    if (event.type !== "report.delta" && event.type !== "report.snapshot") {
      try {
        this.store.appendEvent(live.id, stored);
      } catch (error) {
        serverLogger.error("Failed to persist run event", {
          runId: live.id,
          type: event.type,
          error: errorMessage(error),
        });
      }
    }

    for (const listener of Array.from(live.listeners)) {
      try {
        listener(stored);
      } catch {
        live.listeners.delete(listener);
      }
    }

    if (isTerminalEvent(event)) {
      live.terminal = true;
    }
  }

  private schedulePrune(live: LiveRun): void {
    const timer = setTimeout(() => {
      if (live.terminal) this.active.delete(live.id);
    }, 20 * 60_000);
    timer.unref?.();
  }
}

const globalForManager = globalThis as unknown as { __dossierManager?: RunManager };

export function getRunManager(): RunManager {
  if (!globalForManager.__dossierManager) {
    globalForManager.__dossierManager = new RunManager();
  }
  return globalForManager.__dossierManager;
}

export { isTerminalEvent };

export type { LiveRun };
