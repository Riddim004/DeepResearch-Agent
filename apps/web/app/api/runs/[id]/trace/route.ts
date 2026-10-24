import { getRunManager } from "@/lib/run-manager";
import type { RunTraceResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TRACE_EVENTS = 5_000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const manager = getRunManager();
  const run = manager.getRun(id);
  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }

  const all = manager.eventsSince(id, 0);
  const truncated = all.length > MAX_TRACE_EVENTS;
  const events = truncated ? all.slice(-MAX_TRACE_EVENTS) : all;

  const payload: RunTraceResponse = {
    run: {
      id: run.id,
      query: run.query,
      title: run.title,
      status: run.status,
      depth: run.depth,
      language: run.language,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      model: run.model,
      demo: run.demo,
      stats: run.stats,
    },
    events,
    total: all.length,
    truncated,
  };

  return Response.json(payload, {
    headers: { "cache-control": "no-store" },
  });
}
