import type { EvaluationReport } from "@dossier/harness";
import { Check, ChevronDown, Minus, X } from "lucide-react";

const TIERS = [
  { tier: "S", label: "Official or primary", bar: "bg-accent", text: "text-accent" },
  { tier: "A", label: "Peer-reviewed or authoritative", bar: "bg-amber", text: "text-amber" },
  { tier: "B", label: "Established media", bar: "bg-blue", text: "text-blue" },
  { tier: "C", label: "Unrated or user-generated", bar: "bg-faint", text: "text-faint" },
] as const;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 16).replace("T", " ");
}

export function EvaluationPanel({ report }: { report: EvaluationReport | null }) {
  if (!report) {
    return (
      <div className="mt-8 border border-dashed border-line-strong bg-paper-2/60 px-5 py-6">
        <p className="label">No report yet</p>
        <p className="mt-3 max-w-xl text-[0.8125rem] leading-relaxed text-muted">
          Run <code className="font-mono text-accent-strong">npm run eval</code> to execute the
          offline benchmark. The JSON report is written to{" "}
          <code className="font-mono text-ink-2">evals/latest.json</code> and rendered here.
        </p>
      </div>
    );
  }

  const { summary } = report;
  const tierTotal = TIERS.reduce((total, item) => total + summary.tierMix[item.tier], 0);

  return (
    <div className="mt-8">
      <div className="grid gap-px border border-line bg-line lg:grid-cols-[19rem_1fr]">
        <div className="bg-paper p-5">
          <span className="label">Benchmark grade</span>
          <div className="mt-3 flex items-end gap-4">
            <span className="display text-[5.5rem] leading-[0.8] text-accent">{summary.grade}</span>
            <div className="pb-2 font-mono text-[0.5625rem] uppercase leading-relaxed tracking-[0.08em] text-muted">
              <p>
                {summary.passed}/{summary.cases} cases passed
              </p>
              <p>composite {summary.composite.toFixed(3)}</p>
              <p className="text-faint">fixture benchmark</p>
            </div>
          </div>
          <dl className="mt-5 divide-y divide-line border-t border-line">
            {[
              ["coverage", percent(summary.citationCoverage)],
              ["authority", summary.authorityScore.toFixed(2)],
              ["audit", `${summary.auditScore}/100`],
              ["graceful failures", percent(summary.gracefulFailureRate)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-2">
                <dt className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-faint">
                  {label}
                </dt>
                <dd className="font-mono text-[0.625rem] text-ink-2">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col justify-between bg-paper">
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
            {[
              ["cases", `${summary.passed}/${summary.cases}`],
              ["citation coverage", percent(summary.citationCoverage)],
              ["authority mix", summary.authorityScore.toFixed(2)],
              ["mean latency", `${summary.avgLatencyMs}ms`],
            ].map(([label, value]) => (
              <div key={label} className="bg-paper px-4 py-4">
                <p className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-faint">
                  {label}
                </p>
                <p className="mt-2 font-serif text-[1.6rem] tracking-[-0.02em] text-ink">{value}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-line px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-faint">
                cited source authority
              </p>
              <p className="font-mono text-[0.5rem] uppercase tracking-[0.08em] text-muted">
                {tierTotal} cited sources
              </p>
            </div>
            <div className="mt-3 flex h-2 overflow-hidden bg-paper-3" aria-hidden>
              {tierTotal > 0 &&
                TIERS.map((item) =>
                  summary.tierMix[item.tier] > 0 ? (
                    <span
                      key={item.tier}
                      className={item.bar}
                      style={{ flexGrow: summary.tierMix[item.tier] }}
                    />
                  ) : null,
                )}
            </div>
            <div className="mt-3 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
              {TIERS.map((item) => (
                <div key={item.tier} className="flex items-baseline gap-2">
                  <span className={`font-mono text-[0.625rem] ${item.text}`}>{item.tier}</span>
                  <span className="min-w-0 flex-1 truncate text-[0.625rem] text-muted">
                    {item.label}
                  </span>
                  <span className="font-mono text-[0.5625rem] text-ink-2">
                    {summary.tierMix[item.tier]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 border border-line">
        <div className="flex items-center justify-between border-b border-line bg-paper-2 px-4 py-2">
          <span className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-faint">
            Case results
          </span>
          <span className="hidden font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint sm:inline">
            coverage · authority · domains · time
          </span>
        </div>
        {report.cases.map((result) => (
          <details key={result.id} className="group border-b border-line last:border-b-0">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-paper-2/60 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={`status-dot ${result.passed ? "status-dot-ok" : "bg-accent"}`}
                  aria-hidden
                />
                <span className="truncate font-mono text-[0.6875rem] text-ink">{result.id}</span>
                <span className="hidden truncate text-[0.625rem] text-muted md:inline">
                  {result.name}
                </span>
              </span>
              <span
                className={`font-mono text-[0.5625rem] uppercase tracking-[0.08em] ${
                  result.passed ? "text-moss" : "text-accent"
                }`}
              >
                {result.passed ? "pass" : "fail"}
              </span>
              <span className="w-14 text-right font-mono text-[0.5625rem] text-muted">
                {result.metrics ? `${result.metrics.citations} cites` : result.errorCode}
              </span>
              <span className="w-10 text-right font-mono text-[0.5625rem] text-ink-2">
                {result.metrics ? percent(result.metrics.coverage) : "—"}
              </span>
              <span className="hidden w-10 text-right font-mono text-[0.5625rem] text-ink-2 sm:inline">
                {result.metrics ? result.metrics.authority.toFixed(2) : "—"}
              </span>
              <span className="hidden w-8 text-right font-mono text-[0.5625rem] text-ink-2 sm:inline">
                {result.metrics ? result.metrics.domains : "—"}
              </span>
              <span className="hidden w-12 text-right font-mono text-[0.5625rem] text-muted sm:inline">
                {result.metrics ? `${result.metrics.durationMs}ms` : "—"}
              </span>
              <ChevronDown
                className="size-3 flex-none text-faint transition-transform group-open:rotate-180"
                strokeWidth={1.8}
              />
            </summary>
            <div className="border-t border-line bg-paper-2/60 px-4 py-3 sm:px-5">
              <p className="text-[0.75rem] leading-relaxed text-muted">{result.note}</p>
              {result.errorCode ? (
                <p className="mt-2 font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-accent">
                  error {result.errorCode}
                </p>
              ) : null}
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {result.checks.map((check) => (
                  <li
                    key={check.name}
                    className="flex items-start gap-2 text-[0.6875rem] leading-relaxed"
                  >
                    {check.passed ? (
                      <Check className="mt-0.5 size-3 flex-none text-moss" strokeWidth={2} />
                    ) : (
                      <X className="mt-0.5 size-3 flex-none text-accent" strokeWidth={2} />
                    )}
                    <span className="text-ink-2">{check.name}</span>
                    {check.detail ? (
                      <span className="ml-2 whitespace-nowrap font-mono text-[0.5625rem] text-faint">
                        {check.detail}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {result.sources.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {result.sources.map((source) => (
                    <span
                      key={`${result.id}-${source.number}`}
                      className="inline-flex items-center gap-1.5 border border-line bg-paper px-2 py-0.5 font-mono text-[0.5rem] text-muted"
                    >
                      <span
                        className={
                          TIERS.find((item) => item.tier === source.tier)?.text ?? "text-faint"
                        }
                      >
                        {source.tier}
                      </span>
                      {source.domain}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint">
                <span className="flex items-center gap-1">
                  <Minus className="size-2.5" strokeWidth={2} />
                  {result.events.searches} searches
                </span>
                <span>{result.events.searchFailures} search failures</span>
                <span>{result.events.readFailures} read failures</span>
                <span>{result.events.revisions} revisions</span>
                <span>{result.events.total} events</span>
              </p>
            </div>
          </details>
        ))}
      </div>

      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-faint">
        <span>
          report {formatGeneratedAt(report.generatedAt)} · offline fixture corpus · deterministic
          writer
        </span>
        <span>npm run eval · evals/latest.json</span>
      </p>
    </div>
  );
}
