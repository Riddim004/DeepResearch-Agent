import { getPublicConfig } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(getPublicConfig(), {
    headers: { "cache-control": "no-store" },
  });
}
