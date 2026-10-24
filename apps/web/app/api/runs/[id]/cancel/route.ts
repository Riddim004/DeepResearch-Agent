import { getRunManager } from "@/lib/run-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const manager = getRunManager();
  const run = manager.getRun(id);
  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }
  const cancelled = manager.cancel(id);
  if (!cancelled) {
    return Response.json({ error: "This run is no longer active." }, { status: 409 });
  }
  return Response.json({ cancelled: true }, { headers: { "cache-control": "no-store" } });
}
