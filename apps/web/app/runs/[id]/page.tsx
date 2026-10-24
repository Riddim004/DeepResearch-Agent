import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunDesk } from "@/components/run/run-desk";
import { getRunManager } from "@/lib/run-manager";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const run = getRunManager().getRunView(id);
  if (!run) return { title: "Run not found" };
  return {
    title: run.title ?? run.query,
    description: `A cited research brief on “${run.query}”.`,
  };
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manager = getRunManager();
  const run = manager.getRunView(id);
  if (!run) notFound();
  const events = manager.eventsSince(id, 0);
  return <RunDesk initialRun={run} initialEvents={events} />;
}
