"use client";

import { ArrowUpRight, ChevronDown, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { Depth } from "@dossier/harness/browser";
import type { PublicConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

const DEPTH_ORDER: Depth[] = ["quick", "standard", "deep"];

const DEPTH_COPY: Record<Depth, { title: string; meta: string }> = {
  quick: { title: "Quick scan", meta: "Fast orientation" },
  standard: { title: "Standard brief", meta: "The default" },
  deep: { title: "Deep dossier", meta: "Full investigation" },
};

const LANGUAGES = [
  { value: "auto", label: "Auto language" },
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
  { value: "ja", label: "日本語" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
];

export function Composer({
  config,
  examples,
  defaultQuery = "",
}: {
  config: PublicConfig;
  examples: string[];
  defaultQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [depth, setDepth] = useState<Depth>("standard");
  const [language, setLanguage] = useState("auto");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(260, Math.max(132, element.scrollHeight))}px`;
  }, [query]);

  async function submit() {
    const value = query.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: value,
          depth,
          language,
        }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        throw new Error(data.error ?? "The run could not be started.");
      }
      router.push(`/runs/${data.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "The run could not be started.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      className="paper-card overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="label label-strong">New dossier</span>
        <span className="flex min-w-0 items-center gap-2 text-[0.6875rem] text-muted">
          <span className={cn("status-dot", config.demo ? "status-dot-warn" : "status-dot-ok")} />
          <span className="truncate font-mono text-[0.625rem] tracking-[0.04em]">
            {config.demo ? "DEMO WRITER · LIVE SEARCH" : config.model}
          </span>
        </span>
      </div>

      <div className="px-4 pb-2 pt-5 sm:px-5">
        <label htmlFor="research-query" className="sr-only">
          Research question
        </label>
        <textarea
          id="research-query"
          ref={textarea}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          maxLength={4_000}
          rows={4}
          placeholder="What should the harness investigate?"
          className="w-full resize-none bg-transparent font-serif text-[1.5rem] leading-[1.28] tracking-[-0.02em] text-ink placeholder:text-faint/75 focus:outline-none sm:text-[1.65rem]"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuery(example);
                textarea.current?.focus();
              }}
              className="chip max-w-full text-left transition-colors hover:border-line-strong hover:text-ink"
              title={example}
            >
              <span className="truncate">{example}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-line px-4 py-4 sm:px-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Depth</span>
          <span className="font-mono text-[0.625rem] text-faint">
            {config.limits.find((limit) => limit.depth === depth)?.maxReads ?? 10} source cap
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Research depth">
          {DEPTH_ORDER.map((value) => {
            const active = depth === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDepth(value)}
                className={cn(
                  "rounded-[5px] border px-2 py-2.5 text-left transition-colors",
                  active
                    ? "border-accent bg-accent-soft/65 text-ink"
                    : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <span className="block font-sans text-[0.75rem] font-medium tracking-[-0.01em]">
                  {DEPTH_COPY[value].title}
                </span>
                <span className="mt-0.5 block font-mono text-[0.5625rem] uppercase tracking-[0.08em] opacity-70">
                  {DEPTH_COPY[value].meta}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="appearance-none rounded-[4px] border border-line bg-transparent py-1.5 pl-2.5 pr-7 text-[0.75rem] text-muted transition-colors hover:border-line-strong hover:text-ink focus:border-line-strong focus:outline-none"
              aria-label="Report language"
            >
              {LANGUAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-faint"
              strokeWidth={1.8}
            />
          </div>
          <span className="hidden text-[0.6875rem] text-faint sm:inline">{config.searchLabel}</span>
        </div>
        <button
          type="submit"
          disabled={submitting || query.trim().length < 3}
          className="btn btn-primary h-10 gap-2 px-4"
        >
          {submitting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
              Starting
            </>
          ) : (
            <>
              Start research
              <ArrowUpRight className="size-3.5" strokeWidth={2} />
            </>
          )}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="border-t border-accent/30 bg-accent-soft/50 px-4 py-2.5 text-[0.75rem] text-accent-strong"
        >
          {error}
        </div>
      )}
    </form>
  );
}
