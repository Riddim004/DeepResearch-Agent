import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Database,
  FileText,
  GitBranch,
  Radio,
  Search,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import Link from "next/link";

import { EvaluationPanel } from "@/components/harness/evaluation-panel";
import { InvocationTabs } from "@/components/harness/invocation-tabs";
import { TraceExplorer } from "@/components/harness/trace-explorer";
import { loadEvaluationReport } from "@/lib/evaluation";
import { getPublicConfig } from "@/lib/server-config";
import { getStore } from "@/lib/store";
import { formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Harness",
  description:
    "The system view of Dossier: a typed five-phase research pipeline with explicit adapters, a reproducible benchmark, and a replayable event log.",
};

const PHASES = [
  {
    number: "01",
    title: "Scope",
    body: "Turn the question into a testable brief. The original query is pinned; counterpoint searches are injected if the plan is one-sided.",
    event: "plan.created",
  },
  {
    number: "02",
    title: "Discover",
    body: "Run providers concurrently, deduplicate URLs, score relevance, and decide whether coverage is sufficient before a follow-up round.",
    event: "search.completed",
  },
  {
    number: "03",
    title: "Read",
    body: "Fetch pages through the guarded reader under a bounded worker pool. Failed sources are recorded, not hidden, and never fatal.",
    event: "source.read",
  },
  {
    number: "04",
    title: "Write",
    body: "Score and pack evidence under a token budget, number the citations, and stream Markdown as the draft is produced.",
    event: "report.delta",
  },
  {
    number: "05",
    title: "Audit",
    body: "Measure citation coverage and claim support. If the draft falls short, request exactly one revision and audit again.",
    event: "audit.completed",
  },
];

const GUARANTEES = [
  "Every [n] in a report resolves to a numbered source in the same run ledger.",
  "Events are persisted before they stream; a refresh replays the trace instead of losing it.",
  "Every fetch and redirect passes protocol, DNS, and private-range validation.",
  "Two abort paths: explicit cancellation and a per-profile time budget.",
  "Citations without a matching source are stripped before display or export.",
  "One revision maximum. The loop can fail, but it cannot run away.",
];

const ENDPOINTS = [
  ["POST", "/api/runs", "create a run"],
  ["GET", "/api/runs/:id", "report, sources, audit, stats"],
  ["GET", "/api/runs/:id/events", "SSE replay + live stream"],
  ["GET", "/api/runs/:id/trace", "persisted events as JSON"],
  ["POST", "/api/runs/:id/cancel", "abort a live run"],
  ["GET", "/api/config", "runtime + limits"],
];

export default async function HarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  const config = getPublicConfig();
  const store = getStore();
  const evaluation = await loadEvaluationReport();
  const recent = store.listRuns(8);
  let runs = recent;

  if (run && !recent.some((item) => item.id === run)) {
    const record = store.getRun(run);
    if (record) {
      runs = [
        {
          id: record.id,
          query: record.query,
          title: record.title,
          status: record.status,
          depth: record.depth,
          createdAt: record.createdAt,
          finishedAt: record.finishedAt,
          durationMs:
            record.startedAt && record.finishedAt ? record.finishedAt - record.startedAt : null,
          sourceCount:
            record.result?.sources.filter((source) => source.number !== null).length ?? 0,
          model: record.model,
          demo: record.demo,
        },
        ...recent,
      ];
    }
  }

  return (
    <main className="relative overflow-hidden">
      <div
        className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[680px] opacity-50"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <section className="grid gap-12 pb-16 pt-12 lg:grid-cols-12 lg:gap-8 lg:pb-24 lg:pt-16">
          <div className="lg:col-span-7">
            <span className="label flex items-center gap-2">
              <span className="inline-block h-px w-8 bg-accent" />
              The harness · system view
            </span>
            <h1 className="display mt-7 text-[clamp(3rem,6.4vw,5.8rem)] text-ink">
              The engine
              <br />
              behind <em className="font-light italic text-accent">the desk.</em>
            </h1>
            <p className="mt-8 max-w-[38rem] text-[1.02rem] leading-relaxed text-muted sm:text-[1.08rem]">
              The research desk is only one client. Underneath it is a typed, event-sourced pipeline
              that can run from a server, a CLI, or your own application — with explicit adapters,
              hard budgets, and an audit trail you can replay after the fact.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/" className="btn btn-primary gap-2">
                Run it from the desk
                <ArrowRight className="size-3.5" strokeWidth={1.8} />
              </Link>
              <a
                href="https://github.com/Riddim004/DeepResearch-Agent/blob/main/docs/architecture.md"
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost gap-2"
              >
                Architecture notes
                <ArrowUpRight className="size-3.5" strokeWidth={1.8} />
              </a>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-muted">
              <span className="flex items-center gap-2">
                <span className="status-dot status-dot-live" />
                {config.demo ? "demo writer · real web search" : `${config.model} · live`}
              </span>
              <span className="hidden text-faint sm:inline">/</span>
              <span>{config.version} · typed events · node</span>
            </div>
          </div>

          <div className="lg:col-span-5 xl:pl-10">
            <div className="border border-line bg-paper-2/85 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="label label-strong">Runtime manifest</span>
                <span className="flex items-center gap-1.5 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-moss">
                  <span className="status-dot status-dot-ok !size-[5px]" />
                  active
                </span>
              </div>
              <dl className="divide-y divide-line">
                {[
                  ["model", config.demo ? `${config.model} (demo)` : config.model],
                  ["search", config.searchLabel],
                  ["reader", "readability + unpdf · SSRF guarded"],
                  ["store", "node:sqlite · run + event log"],
                  ["limits", `${config.maxConcurrentRuns} concurrent · per-IP creation cap`],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-3 px-4 py-2.5">
                    <dt className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-faint">
                      {label}
                    </dt>
                    <dd className="text-[0.7rem] leading-relaxed text-ink-2">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-line bg-paper px-4 py-4">
                <p className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-faint">
                  execution contract
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[0.6875rem] text-ink-2">
                  <span className="text-accent">scope</span>
                  <span className="text-faint">→</span>
                  <span>discover</span>
                  <span className="text-faint">→</span>
                  <span>read</span>
                  <span className="text-faint">→</span>
                  <span>write</span>
                  <span className="text-faint">→</span>
                  <span className="text-accent">audit</span>
                </div>
                <p className="mt-3 text-[0.625rem] leading-relaxed text-muted">
                  One function. Typed events. No hidden agent framework.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line py-14 lg:py-20" aria-labelledby="pipeline">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="label">Execution model</span>
              <h2 id="pipeline" className="display mt-3 text-[clamp(2rem,3.6vw,3.25rem)] text-ink">
                The loop is the API.
              </h2>
            </div>
            <p className="max-w-md text-[0.8125rem] leading-relaxed text-muted">
              Each phase has a bounded input, a clear artifact, and a named event. The event stream
              is the public contract — the UI, CLI, and SQLite record all consume the same one.
            </p>
          </div>

          <div className="mt-10 grid gap-px border-y border-line bg-line md:grid-cols-5">
            {PHASES.map((phase) => (
              <article key={phase.number} className="flex flex-col bg-paper px-4 py-5 sm:px-5">
                <span className="font-mono text-[0.625rem] text-accent">{phase.number}</span>
                <h3 className="mt-5 font-serif text-[1.35rem] tracking-[-0.02em] text-ink">
                  {phase.title}
                </h3>
                <p className="mt-2 flex-1 text-[0.75rem] leading-relaxed text-muted">
                  {phase.body}
                </p>
                <span className="mt-5 border-t border-line pt-2.5 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint">
                  emits {phase.event}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-14 lg:py-20" aria-labelledby="adapters">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <span className="label">Boundaries</span>
              <h2 id="adapters" className="display mt-3 text-[clamp(2rem,3.6vw,3.25rem)] text-ink">
                A small core.
                <br />
                Explicit edges.
              </h2>
              <p className="mt-4 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
                The pipeline imports no provider, no search client, and no storage driver. They are
                constructor arguments. Swap one without touching the loop.
              </p>
              <p className="mt-5 max-w-sm font-mono text-[0.625rem] leading-relaxed text-faint">
                runResearch(request, {"{"} provider, search, fetcher, onEvent {"}"})
              </p>
            </div>

            <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:col-span-8">
              {[
                {
                  icon: Radio,
                  title: "ModelProvider",
                  signature: "stream(request) → AsyncIterable<ModelStreamEvent>",
                  body: "Plans, writes, audits. OpenAI-compatible by default; the demo writer implements the same contract.",
                  value: config.demo ? "demo writer" : config.model,
                },
                {
                  icon: Search,
                  title: "SearchProvider",
                  signature: "search(query, options) → SearchResult[]",
                  body: "Runs concurrently, deduplicates URLs, tolerates partial provider failure, and records every error.",
                  value: `${config.searchProviders.length} providers`,
                },
                {
                  icon: FileText,
                  title: "PageFetcher",
                  signature: "fetch(url, { signal }) → FetchedPage",
                  body: "HTML and PDF extraction behind SSRF checks, redirect validation, size limits, and timeouts.",
                  value: "readability + unpdf",
                },
                {
                  icon: Database,
                  title: "Host boundary",
                  signature: "RunManager → node:sqlite → SSE",
                  body: "Live fan-out, persistence, replay, cancellation, and rate limiting belong to the app, not the harness.",
                  value: "one process · replayable",
                },
              ].map((adapter) => (
                <article key={adapter.title} className="bg-paper p-5">
                  <div className="flex items-center justify-between gap-3">
                    <adapter.icon className="size-4 text-accent" strokeWidth={1.6} />
                    <span className="max-w-[11rem] truncate font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint">
                      {adapter.value}
                    </span>
                  </div>
                  <h3 className="mt-4 font-mono text-[0.6875rem] font-medium tracking-[-0.01em] text-ink">
                    {adapter.title}
                  </h3>
                  <code className="mt-2 block break-words font-mono text-[0.5625rem] leading-relaxed text-accent-strong">
                    {adapter.signature}
                  </code>
                  <p className="mt-2.5 text-[0.75rem] leading-relaxed text-muted">{adapter.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line py-14 lg:py-20" aria-labelledby="trace">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="label">Observability</span>
              <h2 id="trace" className="display mt-3 text-[clamp(2rem,3.6vw,3.25rem)] text-ink">
                The record,
                <br className="hidden sm:block" /> not a log file.
              </h2>
            </div>
            <p className="max-w-md text-[0.8125rem] leading-relaxed text-muted">
              Pick a stored run. Inspect the typed events that produced it, including failed reads
              and coverage decisions. This is the same data the desk and SSE clients receive.
            </p>
          </div>
          <div className="mt-8">
            <TraceExplorer runs={runs} initialRunId={run ?? null} />
          </div>
          <p className="mt-3 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint">
            source · GET /api/runs/:id/trace · ordered by sequence · stored in sqlite
          </p>
        </section>

        <section className="border-t border-line py-14 lg:py-20" aria-labelledby="evaluation">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="label">Evaluation</span>
              <h2
                id="evaluation"
                className="display mt-3 text-[clamp(2rem,3.6vw,3.25rem)] text-ink"
              >
                Measured,
                <br />
                not asserted.
              </h2>
            </div>
            <p className="max-w-md text-[0.8125rem] leading-relaxed text-muted">
              A fixed offline corpus, seven cases, and a deterministic writer. Every case must pass
              its checks before CI goes green. Cited sources are graded S/A/B/C by provenance, so a
              high score cannot come only from convenient sources.
            </p>
          </div>

          <EvaluationPanel report={evaluation} />

          <p className="mt-5 max-w-2xl text-[0.6875rem] leading-relaxed text-muted">
            The suite covers a standard brief, a quick profile, a Chinese brief, thin evidence,
            search outage, read outage, and an audit-triggered revision. It is a regression
            benchmark for the harness, not a claim about any model&apos;s general research quality.
          </p>
        </section>

        <section className="border-t border-line py-14 lg:py-20" aria-labelledby="invocation">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-5">
              <span className="label">Invocation</span>
              <h2
                id="invocation"
                className="display mt-3 text-[clamp(2rem,3.6vw,3.25rem)] text-ink"
              >
                Use it without
                <br />
                the desk.
              </h2>
              <p className="mt-4 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
                The harness is a function call. The web app wraps it with durable runs and SSE; the
                CLI wraps it with a terminal. Everything below hits the same core.
              </p>

              <div className="mt-7 border-y border-line">
                {ENDPOINTS.map(([method, path, note]) => (
                  <div
                    key={path}
                    className="grid min-w-0 grid-cols-[2.8rem_minmax(0,1fr)] gap-2 border-b border-line py-2 last:border-b-0 sm:grid-cols-[2.8rem_11rem_1fr]"
                  >
                    <span className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-accent">
                      {method}
                    </span>
                    <span className="min-w-0 break-all font-mono text-[0.5625rem] text-ink-2">
                      {path}
                    </span>
                    <span className="col-start-2 min-w-0 break-words text-[0.625rem] text-muted sm:col-start-auto">
                      {note}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 lg:col-span-7">
              <InvocationTabs />
            </div>
          </div>
        </section>

        <section className="border-t border-line py-14 lg:py-20" aria-labelledby="guarantees">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <span className="label">Operating envelope</span>
              <h2
                id="guarantees"
                className="display mt-3 text-[clamp(2rem,3.6vw,3.25rem)] text-ink"
              >
                Bounded by
                <br />
                construction.
              </h2>
              <p className="mt-4 max-w-sm text-[0.8125rem] leading-relaxed text-muted">
                Autonomy is only useful when it has edges. Profiles cap the work; the event record
                makes every skipped source and follow-up decision visible.
              </p>
              <div className="mt-7 flex items-center gap-2 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-muted">
                <GitBranch className="size-3.5 text-accent" strokeWidth={1.7} />
                one revision maximum
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="border border-line">
                <div className="grid grid-cols-4 border-b border-line bg-paper-2 px-4 py-2 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-faint">
                  <span>profile</span>
                  <span className="text-right">sources</span>
                  <span className="text-right">reads</span>
                  <span className="text-right">budget</span>
                </div>
                {config.limits.map((limit) => (
                  <div
                    key={limit.depth}
                    className="grid grid-cols-4 border-b border-line px-4 py-2.5 font-mono text-[0.625rem] text-ink-2 last:border-b-0"
                  >
                    <span className="capitalize">{limit.depth}</span>
                    <span className="text-right text-muted">{limit.maxSources}</span>
                    <span className="text-right text-muted">{limit.maxReads}</span>
                    <span className="text-right text-muted">{formatDuration(limit.timeoutMs)}</span>
                  </div>
                ))}
              </div>

              <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {GUARANTEES.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-[0.75rem] leading-relaxed text-muted"
                  >
                    <ShieldCheck
                      className="mt-0.5 size-3.5 flex-none text-moss"
                      strokeWidth={1.8}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-line py-14 lg:py-20">
          <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <span className="label">Read the code</span>
              <h2 className="display mt-3 text-[clamp(2rem,4vw,3rem)] text-ink">
                The interesting part is the edges.
              </h2>
              <p className="mt-3 max-w-xl text-[0.8125rem] leading-relaxed text-muted">
                The pipeline, providers, guarded reader, context packer, and audit merge are all in
                one workspace package. The desk and CLI are adapters over it.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://github.com/Riddim004/DeepResearch-Agent"
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary gap-2"
              >
                <Terminal className="size-3.5" strokeWidth={1.8} />
                Source
              </a>
              <Link href="/" className="btn gap-2">
                <Boxes className="size-3.5" strokeWidth={1.8} />
                Back to the desk
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
