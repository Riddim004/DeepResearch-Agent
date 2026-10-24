import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const runs = getStore().countRuns();
    return Response.json({
      ok: true,
      version: "0.1.0",
      uptimeSeconds: Math.round(process.uptime()),
      runs,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Storage unavailable",
      },
      { status: 503 },
    );
  }
}
