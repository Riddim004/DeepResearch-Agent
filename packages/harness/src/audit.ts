import { z } from "zod";
import type { AuditIssue, AuditResult, ResearchBrief, Source } from "./types";
import { citationStats } from "./citations";
import { keywordScore, wordCount } from "./util/text";

const SeveritySchema = z.enum(["low", "medium", "high"]).catch("medium");

export const LlmAuditSchema = z.object({
  score: z.coerce.number().min(0).max(100).catch(60),
  issues: z
    .array(
      z.object({
        severity: SeveritySchema,
        claim: z.string().catch(""),
        problem: z.string().catch(""),
        suggestion: z.string().catch(""),
      }),
    )
    .catch([]),
  missingAngles: z.array(z.string()).catch([]),
  verdict: z.enum(["pass", "revise"]).catch("revise"),
  notes: z.string().catch(""),
});

export type LlmAudit = z.infer<typeof LlmAuditSchema>;

export function deterministicAudit(
  markdown: string,
  sources: Source[],
  brief: ResearchBrief,
): AuditResult {
  const stats = citationStats(markdown);
  const words = wordCount(markdown);
  const issues: AuditIssue[] = [];
  const missingAngles: string[] = [];

  if (stats.citationCount === 0) {
    issues.push({
      severity: "high",
      claim: "The report contains no source citations.",
      problem: "Claims are not traceable to the evidence base.",
      suggestion: "Add bracketed citations to every factual sentence.",
    });
  } else if (stats.coverage < 0.45) {
    issues.push({
      severity: stats.coverage < 0.25 ? "high" : "medium",
      claim: `Only ${Math.round(stats.coverage * 100)}% of substantive sentences carry a citation.`,
      problem: "A large share of the report is not traceable to a source.",
      suggestion: "Cite the supporting source for each factual claim or remove it.",
    });
  }

  if (sources.length < 3) {
    issues.push({
      severity: "medium",
      claim: `The evidence base contains only ${sources.length} source${sources.length === 1 ? "" : "s"}.`,
      problem: "Too few independent sources to support a research brief.",
      suggestion: "Add sources from different publishers or primary documents.",
    });
  }

  if (words < 300) {
    issues.push({
      severity: "medium",
      claim: `The report is only ${words} words long.`,
      problem: "The analysis is too thin to answer the brief.",
      suggestion: "Develop the key findings and limitations in more depth.",
    });
  }

  for (const subquestion of brief.subquestions) {
    if (missingAngles.length >= 4) break;
    if (keywordScore(subquestion.question, markdown) < 0.2) {
      missingAngles.push(subquestion.question);
    }
  }

  if (stats.coverage >= 0.45 && /counter|disagree|against|limitation|uncertain/i.test(markdown)) {
    // A visible counterevidence or limitations section is a positive signal.
  } else if (stats.coverage >= 0.45) {
    missingAngles.push("A dedicated treatment of counterevidence and disagreement.");
  }

  const score = Math.min(
    100,
    Math.round(34 + stats.coverage * 52 + Math.min(sources.length, 6) * 2 + (words >= 350 ? 4 : 0)),
  );
  const verdict: AuditResult["verdict"] =
    score >= 70 && stats.coverage >= 0.45 && sources.length >= 3 && words >= 300
      ? "pass"
      : "revise";

  return {
    score,
    citationCoverage: Number(stats.coverage.toFixed(3)),
    sourceCount: sources.length,
    issues: issues.slice(0, 6),
    missingAngles: Array.from(new Set(missingAngles)).slice(0, 5),
    verdict,
    notes: `Deterministic audit: ${Math.round(stats.coverage * 100)}% citation coverage across ${sources.length} cited sources.`,
  };
}

export function parseLlmAudit(value: unknown): LlmAudit {
  const parsed = LlmAuditSchema.parse(value);
  return {
    ...parsed,
    issues: parsed.issues.slice(0, 6).map((issue) => ({
      severity: issue.severity,
      claim: issue.claim.slice(0, 500),
      problem: issue.problem.slice(0, 500),
      suggestion: issue.suggestion.slice(0, 500),
    })),
    missingAngles: Array.from(new Set(parsed.missingAngles.filter(Boolean))).slice(0, 5),
    notes: parsed.notes.slice(0, 500),
  };
}

const SEVERITY_RANK: Record<AuditIssue["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function mergeAudits(deterministic: AuditResult, llm: LlmAudit | null): AuditResult {
  if (!llm) return deterministic;

  const score = Math.round(llm.score * 0.65 + deterministic.score * 0.35);
  const issues = [...llm.issues, ...deterministic.issues]
    .filter((issue) => issue.claim || issue.problem)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const deduped: AuditIssue[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const key = `${issue.claim}::${issue.problem}`.toLowerCase().replace(/\s+/g, " ").slice(0, 180);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
    if (deduped.length >= 8) break;
  }

  const verdict: AuditResult["verdict"] =
    llm.verdict === "revise" ||
    deterministic.verdict === "revise" ||
    score < 70 ||
    deduped.some((issue) => issue.severity === "high")
      ? "revise"
      : "pass";

  return {
    score: Math.max(0, Math.min(100, score)),
    citationCoverage: deterministic.citationCoverage,
    sourceCount: deterministic.sourceCount,
    issues: deduped,
    missingAngles: Array.from(
      new Set([...llm.missingAngles, ...deterministic.missingAngles]),
    ).slice(0, 6),
    verdict,
    notes: llm.notes || deterministic.notes,
  };
}
