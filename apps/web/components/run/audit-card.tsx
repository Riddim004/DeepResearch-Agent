"use client";

import type { AuditResult } from "@dossier/harness/browser";
import { AlertTriangle, Check, ChevronDown, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-accent/30 bg-accent-soft/70 text-accent-strong",
  medium: "border-amber/30 bg-amber-soft/60 text-amber",
  low: "border-line bg-paper-3 text-muted",
};

export function AuditCard({ audit }: { audit: AuditResult }) {
  const [expanded, setExpanded] = useState(false);
  const passed = audit.verdict === "pass";
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, audit.score)) / 100);
  const issues = expanded ? audit.issues : audit.issues.slice(0, 3);

  return (
    <section className="mt-12 border-t border-line pt-8" aria-labelledby="audit-heading">
      <div className="flex gap-5 sm:gap-7">
        <div className="relative size-[68px] flex-none">
          <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--line)" strokeWidth="2" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              fill="none"
              stroke={passed ? "var(--moss)" : "var(--amber)"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-[1.05rem] leading-none text-ink">{audit.score}</span>
            <span className="mt-1 font-mono text-[0.4375rem] uppercase tracking-[0.12em] text-faint">
              / 100
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="label">Citation audit</span>
              <h2
                id="audit-heading"
                className="mt-1.5 font-serif text-[1.65rem] leading-none tracking-[-0.03em] text-ink"
              >
                {passed ? "The brief holds up." : "The brief needs work."}
              </h2>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em]",
                passed
                  ? "border-moss/25 bg-moss-soft/60 text-moss"
                  : "border-amber/30 bg-amber-soft/60 text-amber",
              )}
            >
              {passed ? (
                <ShieldCheck className="size-3" strokeWidth={1.8} />
              ) : (
                <AlertTriangle className="size-3" strokeWidth={1.8} />
              )}
              {passed ? "Audited" : "Revise"}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-px border-y border-line bg-line">
            {[
              ["Citation coverage", `${Math.round(audit.citationCoverage * 100)}%`],
              ["Cited sources", String(audit.sourceCount)],
              ["Issues", String(audit.issues.length)],
            ].map(([label, value]) => (
              <div key={label} className="bg-paper px-3 py-2.5">
                <span className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-faint">
                  {label}
                </span>
                <span className="mt-1 block font-mono text-[0.875rem] text-ink">{value}</span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[0.75rem] leading-relaxed text-muted">{audit.notes}</p>

          {issues.length > 0 ? (
            <div className="mt-5 space-y-2.5">
              {issues.map((issue, index) => (
                <div key={`${issue.claim}-${index}`} className="border border-line bg-paper-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-[3px] border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em]",
                        SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.low,
                      )}
                    >
                      {issue.severity}
                    </span>
                    <p className="min-w-0 flex-1 text-[0.75rem] leading-snug text-ink-2">
                      {issue.claim || issue.problem}
                    </p>
                  </div>
                  {issue.problem && issue.claim && (
                    <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">
                      {issue.problem}
                    </p>
                  )}
                  {issue.suggestion && (
                    <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink-2">
                      <span className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-faint">
                        Fix ·{" "}
                      </span>
                      {issue.suggestion}
                    </p>
                  )}
                </div>
              ))}
              {audit.issues.length > 3 && (
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  className="inline-flex items-center gap-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-muted transition-colors hover:text-ink"
                >
                  <ChevronDown
                    className={cn("size-3 transition-transform", expanded && "rotate-180")}
                    strokeWidth={1.8}
                  />
                  {expanded ? "Show less" : `Show ${audit.issues.length - 3} more`}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-2 text-[0.75rem] text-moss">
              <Check className="size-3.5" strokeWidth={2} />
              No unsupported claims were flagged by the auditor.
            </div>
          )}

          {audit.missingAngles.length > 0 && (
            <div className="mt-5">
              <span className="label">Missing angles</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {audit.missingAngles.map((angle) => (
                  <span key={angle} className="chip !text-[0.5625rem]">
                    {angle}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
