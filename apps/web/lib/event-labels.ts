import type { HarnessEvent } from "@dossier/harness/browser";

export type TraceCategory = "pipeline" | "search" | "source" | "report" | "audit" | "run";

export function eventCategory(type: string): TraceCategory {
  if (type.startsWith("search.")) return "search";
  if (type.startsWith("source.")) return "source";
  if (type.startsWith("report.") || type === "revision.started") return "report";
  if (type.startsWith("audit.")) return "audit";
  if (
    type.startsWith("phase.") ||
    type === "plan.created" ||
    type === "coverage.assessed" ||
    type === "context.built"
  ) {
    return "pipeline";
  }
  return "run";
}

export function eventLabel(event: HarnessEvent): string {
  switch (event.type) {
    case "run.started":
      return `${event.demo ? "demo" : event.model} · ${event.depth} · “${event.query}”`;
    case "phase.started":
      return `${event.label} (${event.index + 1}/${event.total})`;
    case "phase.completed":
      return `${event.phase} completed in ${Math.max(1, Math.round(event.durationMs))}ms`;
    case "plan.created":
      return `${event.brief.subquestions.length} subquestions · ${event.brief.queries.length} searches planned`;
    case "search.started":
      return `round ${event.round} · “${event.query}”`;
    case "search.completed":
      return `${event.count} results · ${event.newCount} new · ${Math.max(1, Math.round(event.durationMs))}ms`;
    case "search.failed":
      return `“${event.query}” — ${event.error}`;
    case "source.found":
      return `${event.source.domain} — ${event.source.title}`;
    case "source.reading":
      return event.title;
    case "source.read":
      return `${event.source.domain} · ${event.source.wordCount ?? "?"} words · ${event.source.provider}`;
    case "source.failed":
      return `${event.title} — ${event.error}`;
    case "coverage.assessed":
      return `round ${event.round} · ${event.gaps.length} gaps · ${event.followUpQueries.length} follow-ups`;
    case "context.built":
      return `${event.citations.length} citations · ${event.sources} sources · ${event.tokens} tokens`;
    case "report.started":
      return `revision ${event.revision}`;
    case "report.delta":
      return `streaming · +${event.text.length} chars`;
    case "report.snapshot":
      return `snapshot · ${event.text.length} chars`;
    case "report.completed":
      return `${event.report.wordCount} words · ${event.report.citationCount} citations · revision ${event.report.revision}`;
    case "audit.started":
      return "checking citation coverage and claim support";
    case "audit.completed":
      return `${event.audit.score}/100 · ${Math.round(event.audit.citationCoverage * 100)}% coverage · ${event.audit.verdict}`;
    case "revision.started":
      return event.reason;
    case "run.completed":
      return `${event.stats.read} sources · ${event.stats.searches} searches · ${Math.round(event.stats.durationMs / 100) / 10}s`;
    case "run.failed":
      return `${event.code} — ${event.error}`;
    case "run.cancelled":
      return "run cancelled";
    case "log":
      return `${event.level}: ${event.message}`;
    default:
      return "event";
  }
}
