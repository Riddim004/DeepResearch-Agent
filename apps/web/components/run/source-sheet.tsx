"use client";

import type { Source } from "@dossier/harness/browser";
import { ArrowUpRight, X } from "lucide-react";
import { useEffect } from "react";

import { hostnameLabel } from "@/lib/utils";

export function SourceSheet({ source, onClose }: { source: Source | null; onClose: () => void }) {
  useEffect(() => {
    if (!source) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [source, onClose]);

  if (!source) return null;

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Source details"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close source"
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[78dvh] overflow-y-auto rounded-t-xl border-t border-line bg-paper-2 px-5 pb-8 pt-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="label label-strong">
            Source {(source.number ?? 0).toString().padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-quiet h-8 w-8 !p-0"
            aria-label="Close source"
          >
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </div>
        <h2 className="mt-3 font-serif text-[1.5rem] leading-tight tracking-[-0.02em] text-ink">
          {source.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-faint">
          <span>{hostnameLabel(source.domain)}</span>
          <span>/</span>
          <span>{source.status}</span>
          {source.wordCount ? (
            <>
              <span>/</span>
              <span>{source.wordCount.toLocaleString()} words</span>
            </>
          ) : null}
        </div>
        {source.excerpt && (
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">{source.excerpt}</p>
        )}
        {source.error && (
          <p className="mt-3 text-[0.75rem] leading-relaxed text-accent">{source.error}</p>
        )}
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn-primary mt-5 w-full gap-2"
        >
          Open original
          <ArrowUpRight className="size-3.5" strokeWidth={2} />
        </a>
      </div>
    </div>
  );
}
