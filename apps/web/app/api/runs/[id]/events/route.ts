import type { HarnessEvent, RunStats } from "@dossier/harness";

import { getRunManager, isTerminalEvent } from "@/lib/run-manager";
import type { RunRecord, StoredHarnessEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function terminalEventFor(run: RunRecord): HarnessEvent {
  if (run.status === "completed") {
    const finishedAt = run.finishedAt ?? Date.now();
    const stats: RunStats = run.stats ?? {
      startedAt: new Date(run.createdAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: Math.max(0, finishedAt - run.createdAt),
      searches: 0,
      found: 0,
      read: 0,
      failedReads: 0,
      rounds: 0,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      estimatedCostUsd: null,
      model: run.model,
      provider: "unknown",
    };
    return { type: "run.completed", stats, title: run.title ?? run.query };
  }
  if (run.status === "cancelled") return { type: "run.cancelled" };
  if (run.status === "failed") {
    return {
      type: "run.failed",
      error: run.error ?? "The run failed.",
      code: run.errorCode ?? "INTERNAL",
    };
  }
  return {
    type: "run.failed",
    error: "The run was interrupted before it could finish.",
    code: "INTERRUPTED",
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const manager = getRunManager();
  const run = manager.getRun(id);
  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const rawAfter = request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? "0";
  const after = Math.max(0, Number(rawAfter) || 0);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;

      const sendRaw = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const sendEvent = (event: StoredHarnessEvent) => {
        sendRaw(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      const cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        unsubscribe?.();
        unsubscribe = null;
      };

      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };

      const live = manager.getLive(id);
      if (live && !live.terminal) {
        unsubscribe = manager.subscribe(id, (event) => {
          sendEvent(event);
          if (isTerminalEvent(event.data)) close();
        });
      }

      let sawTerminal = false;
      for (const event of manager.eventsSince(id, after)) {
        sendEvent(event);
        if (isTerminalEvent(event.data)) {
          sawTerminal = true;
          break;
        }
      }

      if (sawTerminal) {
        close();
        return;
      }

      if (!live || live.terminal) {
        const terminal = terminalEventFor(run);
        const lastSeq = manager.eventsSince(id, 0).at(-1)?.seq ?? after;
        sendEvent({
          seq: lastSeq + 1,
          ts: Date.now(),
          type: terminal.type,
          data: terminal,
        });
        close();
        return;
      }

      if (request.signal.aborted) {
        close();
        return;
      }
      heartbeat = setInterval(() => sendRaw(`: ping ${Date.now()}\n\n`), 15_000);
      heartbeat.unref?.();
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      // The client disconnected; cleanup happens through the abort listener.
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
