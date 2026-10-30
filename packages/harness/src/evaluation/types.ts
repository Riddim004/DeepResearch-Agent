import type { SourceTier } from "../source-tier";
import type { Depth, HarnessErrorCode } from "../types";

export interface EvalExpectations {
  outcome: "success" | "failure";
  errorCode?: HarnessErrorCode;
  failureEvent?: "search.failed" | "source.failed";
  minCitations?: number;
  minCoverage?: number;
  minDomains?: number;
  minAuthority?: number;
  minWords?: number;
  sourceCount?: number;
  auditVerdict?: "pass" | "revise";
  language?: "zh" | "en";
  requireCounterpoint?: boolean;
  requireRevision?: boolean;
}

export interface EvalCase {
  id: string;
  name: string;
  note: string;
  query: string;
  depth: Depth;
  language?: string;
  corpus: "english" | "chinese";
  limit?: number;
  faults?: {
    search?: boolean;
    fetch?: boolean;
    weakFirstDraft?: boolean;
  };
  expect: EvalExpectations;
}

export interface EvalCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface EvalCitedSource {
  number: number;
  domain: string;
  tier: SourceTier;
}

export interface EvalMetrics {
  citations: number;
  coverage: number;
  auditScore: number;
  authority: number;
  domains: number;
  words: number;
  sourceCount: number;
  durationMs: number;
  tokens: number;
}

export interface EvalEventTotals {
  total: number;
  searches: number;
  searchFailures: number;
  readFailures: number;
  revisions: number;
}

export interface EvalCaseResult {
  id: string;
  name: string;
  note: string;
  depth: Depth;
  outcome: "success" | "failure";
  passed: boolean;
  checks: EvalCheck[];
  metrics: EvalMetrics | null;
  errorCode: string | null;
  sources: EvalCitedSource[];
  events: EvalEventTotals;
}

export interface EvalTierMix {
  S: number;
  A: number;
  B: number;
  C: number;
}

export interface EvaluationSummary {
  cases: number;
  passed: number;
  passRate: number;
  grade: "S" | "A" | "B" | "C";
  composite: number;
  citationCoverage: number;
  auditScore: number;
  authorityScore: number;
  domainDiversity: number;
  gracefulFailureRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  tierMix: EvalTierMix;
}

export interface EvaluationReport {
  version: 1;
  mode: "offline-fixture";
  model: string;
  generatedAt: string;
  durationMs: number;
  cases: EvalCaseResult[];
  summary: EvaluationSummary;
}
