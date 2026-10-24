"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Research" },
  { href: "/harness", label: "Harness" },
  { href: "/library", label: "Library" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-6 px-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-1" aria-label="Primary">
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative px-2 py-1.5 text-[0.8125rem] transition-colors sm:px-2.5",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {link.label}
                {active && (
                  <span
                    className="absolute inset-x-2 -bottom-[17px] h-px bg-accent sm:inset-x-2.5"
                    aria-hidden
                  />
                )}
              </Link>
            );
          })}
          <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
          <a
            href="https://github.com/Riddim004/DeepResearch-Agent"
            target="_blank"
            rel="noreferrer"
            className="btn btn-quiet hidden h-8 w-8 !p-0 sm:flex"
            aria-label="Dossier on GitHub"
            title="GitHub"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M12 1.75C6.34 1.75 1.75 6.34 1.75 12c0 4.53 2.94 8.37 7.01 9.73.51.1.7-.22.7-.49 0-.24-.01-1.04-.01-1.89-2.85.62-3.45-1.21-3.45-1.21-.47-1.18-1.14-1.5-1.14-1.5-.93-.63.07-.62.07-.62 1.03.07 1.57 1.06 1.57 1.06.91 1.57 2.4 1.12 2.98.85.09-.66.36-1.12.65-1.38-2.27-.26-4.66-1.14-4.66-5.06 0-1.12.4-2.03 1.06-2.75-.11-.26-.46-1.3.1-2.71 0 0 .86-.27 2.82 1.05a9.78 9.78 0 0 1 5.14 0c1.96-1.32 2.82-1.05 2.82-1.05.56 1.41.21 2.45.1 2.71.66.72 1.06 1.63 1.06 2.75 0 3.93-2.39 4.8-4.67 5.05.37.32.7.94.7 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.7.49A10.25 10.25 0 0 0 22.25 12C22.25 6.34 17.66 1.75 12 1.75Z" />
            </svg>
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
