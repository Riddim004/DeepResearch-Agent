import {
  ArrowRight,
  ArrowUpRight,
  Database,
  Layers,
  Radio,
  Route,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { Composer } from "@/components/composer";
import { StatusPill } from "@/components/status-pill";
import { getPublicConfig } from "@/lib/server-config";
import { getStore } from "@/lib/store";
import { formatDate, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EXAMPLES = [
  "How are open-source AI agent harnesses changing software teams?",
  "What does the evidence say about a four-day work week?",
  "Map the state of grid-scale battery storage in 2026.",
];

const STEPS = [
  {
    number: "01",
    title: "Scope",
    body: "Turns the question into a testable brief: subquestions, search angles, success criteria.",
  },
  {
    number: "02",
    title: "Discover",
    body: "Runs parallel searches, deduplicates sources, then decides whether coverage is actually sufficient.",
  },
  {
    number: "03",
    title: "Read",
    body: "Fetches the source itself, extracts the article or PDF, and discards pages that cannot be read.",
  },
  {
    number: "04",
    title: "Write",
    body: "Selects evidence under a token budget and writes a cited brief — not a chat response.",
  },
  {
    number: "05",
    title: "Audit",
    body: "Checks citation coverage and claim support. If the draft is weak, it revises once and re-audits.",
  },
];

const FEATURES = [
  {
    icon: Radio,
    title: "Typed event protocol",
    body: "Every phase, search, read, delta, and audit is a discriminated event — streamed to the UI and replayed over SSE.",
  },
  {
    icon: ScanLine,
    title: "Citation ledger",
    body: "Claims carry numbered citations mapped to fetched sources. Invalid numbers are stripped, coverage is measured.",
  },
  {
    icon: Route,
    title: "Bounded autonomy",
    body: "Coverage-aware follow-up rounds, hard source caps, time budgets, and one revision. Autonomy without runaway cost.",
  },
  {
    icon: ShieldCheck,
    title: "Guarded reader",
    body: "HTML and PDF extraction behind SSRF protection, redirect re-validation, size limits, and per-domain politeness.",
  },
  {
    icon: Layers,
    title: "Context engineering",
    body: "Passages are scored, deduplicated, and packed into a token budget so one long document cannot crowd out the evidence.",
  },
  {
    icon: Database,
    title: "Durable runs",
    body: "SQLite stores every run and event. Refresh mid-run, replay the trace, cancel cleanly, or inspect the record later.",
  },
];

function timeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Late edition";
  if (hour < 12) return "Morning edition";
  if (hour < 18) return "Afternoon edition";
  return "Evening edition";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const config = getPublicConfig();
  const recentRuns = getStore().listRuns(4);

  return (
    <main className="relative overflow-hidden">
      <div
        className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[780px] opacity-60"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <section className="grid gap-14 pb-20 pt-12 lg:grid-cols-12 lg:gap-8 lg:pb-28 lg:pt-20">
          <div className="lg:col-span-7 xl:col-span-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="label flex items-center gap-2">
                <span className="inline-block h-px w-8 bg-accent" />
                Open-source research harness
              </span>
              <span className="chip !min-h-0 !border-accent/25 !bg-accent-soft/50 !py-1 !text-[0.5625rem] !text-accent-strong">
                v0.1
              </span>
            </div>

            <h1 className="display mt-7 text-[clamp(3.5rem,7.7vw,7.1rem)] text-ink">
              Ask a question.
              <br />
              Get a <em className="accent-underline font-light italic text-accent">cited</em>{" "}
              answer.
            </h1>

            <p className="mt-8 max-w-[36rem] text-[1.02rem] leading-relaxed text-muted sm:text-[1.08rem]">
              Dossier plans its own searches, reads the sources behind them, writes a
              decision-useful brief, and audits the citations. The output is a document you can
              inspect — not a black box.
            </p>

            <div className="mt-10 grid max-w-[38rem] grid-cols-1 gap-px border-y border-line bg-line sm:grid-cols-3">
              {[
                ["01", "Plans the search"],
                ["02", "Reads the source"],
                ["03", "Audits the claim"],
              ].map(([number, label]) => (
                <div key={number} className="flex items-baseline gap-2.5 bg-paper px-3 py-3.5">
                  <span className="font-mono text-[0.5625rem] text-accent">{number}</span>
                  <span className="text-[0.75rem] text-ink-2">{label}</span>
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.6875rem] text-muted">
              <span className="flex items-center gap-2">
                <span className="status-dot status-dot-live" />
                <span className="font-mono text-[0.625rem] uppercase tracking-[0.08em]">
                  {config.demo ? "Demo writer online" : `${config.model} online`}
                </span>
              </span>
              <span className="hidden text-faint sm:inline">/</span>
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.08em]">
                {config.searchLabel}
              </span>
              <span className="hidden text-faint sm:inline">/</span>
              <Link
                href="/harness"
                className="inline-flex items-center gap-1 transition-colors hover:text-ink"
              >
                Inspect the harness
                <ArrowRight className="size-3" strokeWidth={1.8} />
              </Link>
            </div>
          </div>

          <div className="relative lg:col-span-5 xl:col-span-5 xl:pl-8">
            <div className="mb-3 flex items-center justify-between">
              <span className="label">{timeOfDay()}</span>
              <span className="font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-faint">
                No. 001
              </span>
            </div>
            <Composer config={config} examples={EXAMPLES} defaultQuery={q ?? ""} />
            <div className="mt-4 flex items-start gap-2.5 px-1">
              <span className="mt-1.5 h-px w-5 flex-none bg-line-strong" />
              <p className="text-[0.6875rem] leading-relaxed text-muted">
                {config.demo
                  ? "Demo mode uses live web search and a deterministic extractive writer. Add an OpenAI-compatible key for full synthesis."
                  : "Research runs are persisted locally. Model keys stay server-side and are never sent to the browser."}
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-line py-14 lg:py-20" aria-labelledby="how-it-works">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="label">The run, end to end</span>
              <h2
                id="how-it-works"
                className="display mt-3 text-[clamp(2rem,3.6vw,3.25rem)] text-ink"
              >
                A research process,
                <br className="hidden sm:block" /> not a prompt.
              </h2>
            </div>
            <p className="max-w-sm text-[0.8125rem] leading-relaxed text-muted">
              Five explicit phases, one typed event stream. Every decision the harness makes is
              visible, bounded, and replayable.
            </p>
          </div>

          <div className="mt-10 grid gap-px border-y border-line bg-line md:grid-cols-5">
            {STEPS.map((step) => (
              <div key={step.number} className="bg-paper px-4 py-5 sm:px-5">
                <span className="font-mono text-[0.625rem] text-accent">{step.number}</span>
                <h3 className="mt-5 font-serif text-[1.35rem] tracking-[-0.02em] text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-[0.75rem] leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-14 lg:py-20" aria-labelledby="built-to-inspect">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <span className="label">Design decisions</span>
              <h2
                id="built-to-inspect"
                className="display mt-3 text-[clamp(2rem,3.6vw,3.25rem)] text-ink"
              >
                Built to be
                <br />
                inspected.
              </h2>
              <p className="mt-4 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
                The harness is the product. Models, search providers, and storage are adapters
                around a small, observable core.
              </p>
              <Link
                href="https://github.com/Riddim004/DeepResearch-Agent"
                target="_blank"
                className="btn btn-ghost mt-6 gap-2"
              >
                View the source
                <ArrowUpRight className="size-3.5" strokeWidth={1.8} />
              </Link>
            </div>
            <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:col-span-8 lg:grid-cols-2">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="bg-paper-2 p-5">
                  <feature.icon className="size-4 text-accent" strokeWidth={1.6} />
                  <h3 className="mt-4 text-[0.8125rem] font-semibold tracking-[-0.01em] text-ink">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-[0.75rem] leading-relaxed text-muted">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line py-14 lg:py-20" aria-labelledby="recent-dossiers">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="label">The record</span>
              <h2
                id="recent-dossiers"
                className="display mt-3 text-[clamp(2rem,3.6vw,3.25rem)] text-ink"
              >
                Recent dossiers
              </h2>
            </div>
            <Link
              href="/library"
              className="inline-flex items-center gap-1.5 text-[0.75rem] text-muted transition-colors hover:text-ink"
            >
              Open the library
              <ArrowRight className="size-3.5" strokeWidth={1.7} />
            </Link>
          </div>

          {recentRuns.length > 0 ? (
            <div className="mt-8 border-y border-line">
              {recentRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="group grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line py-4 transition-colors last:border-0 hover:bg-paper-2/60 sm:grid-cols-[1fr_8rem_5rem_4rem_auto] sm:px-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <StatusPill status={run.status} />
                      <span className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-faint">
                        {run.depth}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate font-serif text-[1.05rem] tracking-[-0.01em] text-ink">
                      {run.title ?? run.query}
                    </p>
                  </div>
                  <span className="hidden font-mono text-[0.625rem] text-muted sm:block">
                    {formatDate(run.createdAt)}
                  </span>
                  <span className="hidden font-mono text-[0.625rem] text-muted sm:block">
                    {run.sourceCount} sources
                  </span>
                  <span className="hidden font-mono text-[0.625rem] text-muted sm:block">
                    {formatDuration(run.durationMs)}
                  </span>
                  <ArrowUpRight
                    className="size-4 text-faint transition-colors group-hover:text-accent"
                    strokeWidth={1.6}
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-8 grid gap-px border border-line bg-line md:grid-cols-[1fr_2fr]">
              <div className="bg-paper-2 p-6">
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-faint">
                  Empty ledger
                </span>
                <p className="mt-3 font-serif text-[1.4rem] leading-snug tracking-[-0.02em] text-ink">
                  Your first dossier will appear here.
                </p>
              </div>
              <div className="flex flex-col justify-center bg-paper-2 p-6">
                <p className="max-w-md text-[0.8125rem] leading-relaxed text-muted">
                  Start with a question above. The harness will leave a complete record: the plan,
                  the searches, the sources it read, the report, and the audit.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
