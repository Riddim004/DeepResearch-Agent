"use client";

import { ArrowLeft, Check, Copy, Loader2, Plus, SquareTerminal, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { StatusPill } from "@/components/status-pill";
import type { RunStatus } from "@/lib/types";
import { cn, formatDate, formatElapsed } from "@/lib/utils";

export function RunHeader({
  runId,
  query,
  status,
  depth,
  model,
  demo,
  createdAt,
  startedAt,
  finishedAt,
  cancelling,
  onCancel,
}: {
  runId: string;
  query: string;
  status: RunStatus;
  depth: string;
  model: string;
  demo: boolean;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const running = status === "running" || status === "queued";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked; the URL remains in the address bar.
    }
  }

  return (
    <header className="border-b border-line pb-7 pt-7 sm:pb-9 sm:pt-9">
      <div className="flex items-center gap-2 text-[0.6875rem] text-muted">
        <Link
          href="/library"
          className="inline-flex items-center gap-1 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3" strokeWidth={1.8} />
          Library
        </Link>
        <span className="text-faint">/</span>
        <span className="font-mono text-[0.5625rem] uppercase tracking-[0.14em]">Dossier</span>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-4xl flex-1">
          <h1 className="font-serif text-[clamp(2rem,4.5vw,3.35rem)] leading-[1.06] tracking-[-0.035em] text-ink">
            {query}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusPill status={status} />
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-muted">
              {depth}
            </span>
            <span className="text-faint">·</span>
            <span className="max-w-[18rem] truncate font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted">
              {demo ? "Demo writer" : model}
            </span>
            <span className="text-faint">·</span>
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted">
              {formatDate(startedAt ?? createdAt, true)}
            </span>
            <span className="text-faint">·</span>
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted">
              {formatElapsed(startedAt, finishedAt)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="btn btn-sm btn-quiet gap-1.5"
            aria-label="Copy run link"
          >
            {copied ? (
              <Check className="size-3.5 text-moss" strokeWidth={2} />
            ) : (
              <Copy className="size-3.5" strokeWidth={1.7} />
            )}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
          </button>
          <Link
            href={`/harness?run=${runId}`}
            className="btn btn-sm btn-quiet gap-1.5"
            aria-label="Inspect this run in the harness console"
            title="Inspect the raw trace in the harness console"
          >
            <SquareTerminal className="size-3.5" strokeWidth={1.7} />
            <span className="hidden sm:inline">Trace</span>
          </Link>
          {running && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className={cn("btn btn-sm gap-1.5", cancelling && "opacity-60")}
            >
              {cancelling ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <X className="size-3.5" strokeWidth={2} />
              )}
              {cancelling ? "Stopping" : "Cancel"}
            </button>
          )}
          <Link href="/" className="btn btn-sm btn-primary gap-1.5">
            <Plus className="size-3.5" strokeWidth={2} />
            New research
          </Link>
        </div>
      </div>
    </header>
  );
}
