import Link from "next/link";
import { cn } from "@/lib/utils";

export function DossierMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("size-5", className)}>
      <path
        d="M4.25 2.75h10.1l5.4 5.4v13.1H4.25V2.75Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M14.25 2.9v5.35h5.3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 12.3h8M8 15.7h5.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="18.55" cy="18.4" r="2.3" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "group flex items-center gap-2.5 text-ink transition-opacity hover:opacity-80",
        className,
      )}
      aria-label="Dossier home"
    >
      <span className="flex size-8 items-center justify-center rounded-[5px] border border-line bg-paper-2">
        <DossierMark className="size-[18px]" />
      </span>
      <span className="font-serif text-[1.35rem] leading-none tracking-[-0.035em]">Dossier</span>
    </Link>
  );
}
