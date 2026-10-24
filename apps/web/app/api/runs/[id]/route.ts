import { getRunManager } from "@/lib/run-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const run = getRunManager().getRunView(id);
  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }
  return Response.json({ run }, { headers: { "cache-control": "no-store" } });
}
