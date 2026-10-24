import type { Metadata } from "next";
import { ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { getStore } from "@/lib/store";
import { formatDate, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library",
  description: "Every Dossier research run, with its sources, report, and citation audit.",
};

export default async function LibraryPage() {
  const runs = getStore().listRuns(100);

  return (
    <main className="mx-auto w-full max-w-[1200px] px-5 pt-12 sm:px-8 sm:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="label">Archive</span>
          <h1 className="display mt-3 text-[clamp(2.8rem,6vw,5.2rem)] text-ink">The library</h1>
          <p className="mt-4 max-w-md text-[0.875rem] leading-relaxed text-muted">
            Every dossier is a record: the plan, the sources it read, the report, and the audit.
            Nothing disappears into a chat window.
          </p>
        </div>
        <Link href="/" className="btn btn-primary gap-2">
          <Plus className="size-3.5" strokeWidth={2} />
          New research
        </Link>
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-line py-3">
        <span className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-faint">
          {runs.length} {runs.length === 1 ? "record" : "records"}
        </span>
        <span className="hidden font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-faint sm:block">
          Newest first
        </span>
      </div>

      {runs.length === 0 ? (
        <div className="mt-2 grid gap-px border border-line bg-line md:grid-cols-[1fr_1.4fr]">
          <div className="bg-paper-2 p-8">
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-faint">
              Empty ledger
            </span>
            <p className="mt-4 font-serif text-[1.8rem] leading-tight tracking-[-0.03em] text-ink">
              No dossiers
              <br />
              yet.
            </p>
          </div>
          <div className="flex flex-col justify-center bg-paper-2 p-8">
            <p className="max-w-sm text-[0.8125rem] leading-relaxed text-muted">
              Start with a question on the research desk. Your first run will leave a complete,
              inspectable record here.
            </p>
            <Link href="/" className="btn mt-5 w-fit gap-2">
              Go to the desk
              <ArrowUpRight className="size-3.5" strokeWidth={1.8} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="border-b border-line">
          <div className="hidden grid-cols-[7rem_1fr_6rem_5rem_5rem_2rem] gap-4 border-b border-line py-2 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-faint md:grid">
            <span>Date</span>
            <span>Dossier</span>
            <span>Depth</span>
            <span>Sources</span>
            <span>Duration</span>
            <span />
          </div>
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="group grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2 border-b border-line py-4 transition-colors last:border-0 hover:bg-paper-2/60 md:grid-cols-[7rem_1fr_6rem_5rem_5rem_2rem] md:items-center md:px-1"
            >
              <span className="order-2 font-mono text-[0.625rem] text-muted md:order-none">
                {formatDate(run.createdAt)}
              </span>
              <div className="order-1 min-w-0 md:order-none">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={run.status} />
                  {run.demo && (
                    <span className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-faint">
                      demo
                    </span>
                  )}
                </div>
                <p className="mt-1.5 truncate font-serif text-[1.1rem] tracking-[-0.01em] text-ink">
                  {run.title ?? run.query}
                </p>
                <p className="mt-0.5 truncate text-[0.6875rem] text-muted">{run.query}</p>
              </div>
              <span className="order-3 font-mono text-[0.625rem] uppercase tracking-[0.06em] text-muted md:order-none">
                {run.depth}
              </span>
              <span className="order-4 font-mono text-[0.625rem] text-muted md:order-none">
                {run.sourceCount}
              </span>
              <span className="order-5 font-mono text-[0.625rem] text-muted md:order-none">
                {formatDuration(run.durationMs)}
              </span>
              <ArrowUpRight
                className="order-6 size-4 text-faint transition-colors group-hover:text-accent md:order-none"
                strokeWidth={1.6}
              />
            </Link>
          ))}
        </div>
      )}

      <p className="mt-8 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-faint">
        Runs are stored locally in SQLite. Delete the data directory to reset the archive.
      </p>
    </main>
  );
}
