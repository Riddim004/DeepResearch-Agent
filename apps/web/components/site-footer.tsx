import Link from "next/link";

import { DossierMark } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-md">
          <div className="flex items-center gap-2 text-ink">
            <DossierMark className="size-4" />
            <span className="font-serif text-lg tracking-[-0.03em]">Dossier</span>
          </div>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
            A production-grade deep research harness. Plans, searches, reads, writes, and audits —
            with every claim traceable to a source.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.75rem] text-muted">
          <Link href="/library" className="transition-colors hover:text-ink">
            Library
          </Link>
          <Link href="/harness" className="transition-colors hover:text-ink">
            Harness
          </Link>
          <a
            href="https://github.com/Riddim004/DeepResearch-Agent"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-ink"
          >
            GitHub
          </a>
          <a
            href="https://github.com/Riddim004/DeepResearch-Agent/blob/main/docs/architecture.md"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-ink"
          >
            Architecture
          </a>
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-faint">
            MIT · 2026
          </span>
        </div>
      </div>
    </footer>
  );
}
