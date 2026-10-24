import { z } from "zod";

import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getRunManager, RunCapacityError } from "@/lib/run-manager";
import { MAX_CONCURRENT_RUNS } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateRunSchema = z.object({
  query: z.string().trim().min(3).max(4_000),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  language: z.string().trim().max(20).optional(),
  audience: z.string().trim().max(240).optional(),
  recencyDays: z.number().int().min(1).max(3_650).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(`create:${clientIp(request)}`, 6, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Too many research runs from this address. Try again later." },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = CreateRunSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid research request.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const manager = getRunManager();
    if (manager.runningCount() >= MAX_CONCURRENT_RUNS) {
      return Response.json(
        { error: "The research desk is busy. Wait for a run to finish and try again." },
        { status: 429 },
      );
    }
    const record = manager.create(parsed.data);
    return Response.json(
      {
        id: record.id,
        status: record.status,
        demo: record.demo,
        model: record.model,
        depth: record.depth,
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RunCapacityError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    return Response.json(
      {
        error: "The run could not be started.",
        detail: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 30);
  const runs = getRunManager().listRuns(Number.isFinite(limit) ? limit : 30);
  return Response.json({ runs }, { headers: { "cache-control": "no-store" } });
}
