import { MockProvider } from "../providers/mock";
import { runResearch } from "../pipeline";
import { domainTier, SOURCE_TIER_WEIGHTS } from "../source-tier";
import { citationStats } from "../citations";
import type {
  CompletionRequest,
  HarnessEvent,
  ModelProvider,
  ModelStreamEvent,
  ResearchResult,
  Source,
} from "../types";
import { HarnessError } from "../util/errors";
import { estimateTokens } from "../util/text";
import { EVAL_CASES } from "./cases";
import { CorpusFetcher, CorpusSearchProvider, EVAL_CORPORA } from "./fixtures";
import type {
  EvalCase,
  EvalCaseResult,
  EvalCheck,
  EvalCitedSource,
  EvalMetrics,
  EvalTierMix,
  EvaluationReport,
  EvaluationSummary,
} from "./types";

const MODEL = "dossier-demo-writer";

class WeakFirstDraftProvider implements ModelProvider {
  readonly id = "eval-recovery";
  readonly model = MODEL;
  readonly demo = true;

  constructor(private readonly inner: MockProvider) {}

  async *stream(request: CompletionRequest): AsyncIterable<ModelStreamEvent> {
    if (request.task === "report") {
      const text = "# Uncited draft\n\nThis draft asserts a conclusion without citing evidence.";
      yield { type: "text", text };
      const inputTokens = request.messages.reduce(
        (total, message) => total + estimateTokens(message.content),
        0,
      );
      const outputTokens = estimateTokens(text);
      yield {
        type: "usage",
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      };
      yield { type: "done", finishReason: "stop" };
      return;
    }
    yield* this.inner.stream(request);
  }
}

export interface RunEvaluationOptions {
  cases?: EvalCase[];
}

export async function runEvaluation(options: RunEvaluationOptions = {}): Promise<EvaluationReport> {
  const startedAt = Date.now();
  const cases = options.cases ?? EVAL_CASES;
  const results: EvalCaseResult[] = [];

  for (const testCase of cases) {
    results.push(await runCase(testCase));
  }

  return {
    version: 1,
    mode: "offline-fixture",
    model: MODEL,
    generatedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    cases: results,
    summary: summarize(results),
  };
}

async function runCase(testCase: EvalCase): Promise<EvalCaseResult> {
  const documents = EVAL_CORPORA[testCase.corpus];
  const events: HarnessEvent[] = [];
  const mock = new MockProvider({ delayMs: 0 });
  const provider = testCase.faults?.weakFirstDraft ? new WeakFirstDraftProvider(mock) : mock;

  const searchOptions: { limit?: number; fail?: boolean } = {};
  if (testCase.limit) searchOptions.limit = testCase.limit;
  if (testCase.faults?.search) searchOptions.fail = true;
  const fetchOptions: { fail?: boolean } = {};
  if (testCase.faults?.fetch) fetchOptions.fail = true;

  let result: ResearchResult | null = null;
  let error: unknown = null;

  try {
    result = await runResearch(
      {
        query: testCase.query,
        depth: testCase.depth,
        ...(testCase.language ? { language: testCase.language } : {}),
      },
      {
        provider,
        search: new CorpusSearchProvider(documents, searchOptions),
        fetcher: new CorpusFetcher(documents, fetchOptions),
        demo: true,
        onEvent: (event) => events.push(event),
      },
    );
  } catch (caught) {
    error = caught;
  }

  const outcome = result ? "success" : "failure";
  const errorCode = error instanceof HarnessError ? error.code : error ? "INTERNAL" : null;
  const checks: EvalCheck[] = [];

  checks.push({
    name: `outcome is ${testCase.expect.outcome}`,
    passed: outcome === testCase.expect.outcome,
    ...(outcome === "failure" && error
      ? { detail: error instanceof HarnessError ? error.userMessage : String(error) }
      : {}),
  });

  if (testCase.expect.outcome === "failure") {
    checks.push({
      name: "failure is a typed HarnessError",
      passed: error instanceof HarnessError,
      ...(errorCode ? { detail: errorCode } : {}),
    });
    if (testCase.expect.errorCode) {
      checks.push({
        name: `error code is ${testCase.expect.errorCode}`,
        passed: errorCode === testCase.expect.errorCode,
        ...(errorCode ? { detail: errorCode } : {}),
      });
    }
    if (testCase.expect.failureEvent) {
      const expected = testCase.expect.failureEvent;
      checks.push({
        name: `emits ${expected}`,
        passed: events.some((event) => event.type === expected),
      });
    }
    checks.push({
      name: "phases close cleanly",
      passed:
        events.some((event) => event.type === "phase.started") &&
        events.some((event) => event.type === "phase.completed"),
    });

    return {
      id: testCase.id,
      name: testCase.name,
      note: testCase.note,
      depth: testCase.depth,
      outcome,
      passed: checks.every((check) => check.passed),
      checks,
      metrics: null,
      errorCode,
      sources: [],
      events: countEvents(events),
    };
  }

  if (!result) {
    return {
      id: testCase.id,
      name: testCase.name,
      note: testCase.note,
      depth: testCase.depth,
      outcome,
      passed: false,
      checks,
      metrics: null,
      errorCode,
      sources: [],
      events: countEvents(events),
    };
  }

  const stats = citationStats(result.report.markdown);
  const validNumbers = new Set(result.citations.map((citation) => citation.number));
  const citedSources = result.sources.filter(
    (source) => source.number !== null && stats.numbers.includes(source.number),
  );
  const invalidNumbers = new Set<number>();
  for (const match of result.report.markdown.matchAll(/\[(\d{1,3}(?:\s*[,，]\s*\d{1,3})*)\]/g)) {
    for (const value of (match[1] ?? "").split(/[,，]/)) {
      const number = Number(value.trim());
      if (Number.isInteger(number) && !validNumbers.has(number)) invalidNumbers.add(number);
    }
  }

  const domains = Array.from(new Set(citedSources.map((source) => source.domain)));
  const tiers = citedSources.map((source) => domainTier(source.domain));
  const authority =
    tiers.length === 0
      ? 0
      : tiers.reduce((total, tier) => total + SOURCE_TIER_WEIGHTS[tier], 0) / tiers.length;
  const readSources = result.sources.filter((source) => source.status === "read");

  checks.push({
    name: "citations resolve to numbered sources",
    passed: invalidNumbers.size === 0,
    ...(invalidNumbers.size > 0
      ? { detail: `unresolved: ${Array.from(invalidNumbers).join(", ")}` }
      : {}),
  });
  if (testCase.expect.minCitations !== undefined) {
    checks.push({
      name: `at least ${testCase.expect.minCitations} citations`,
      passed: result.report.citationCount >= testCase.expect.minCitations,
      detail: `${result.report.citationCount}`,
    });
  }
  if (testCase.expect.minCoverage !== undefined) {
    checks.push({
      name: `citation coverage ≥ ${Math.round(testCase.expect.minCoverage * 100)}%`,
      passed: result.audit.citationCoverage >= testCase.expect.minCoverage,
      detail: `${Math.round(result.audit.citationCoverage * 100)}%`,
    });
  }
  if (testCase.expect.minDomains !== undefined) {
    checks.push({
      name: `at least ${testCase.expect.minDomains} cited domains`,
      passed: domains.length >= testCase.expect.minDomains,
      detail: `${domains.length}`,
    });
  }
  if (testCase.expect.minAuthority !== undefined) {
    checks.push({
      name: `authority ≥ ${testCase.expect.minAuthority.toFixed(2)}`,
      passed: authority >= testCase.expect.minAuthority,
      detail: authority.toFixed(2),
    });
  }
  if (testCase.expect.minWords !== undefined) {
    checks.push({
      name: `at least ${testCase.expect.minWords} words`,
      passed: result.report.wordCount >= testCase.expect.minWords,
      detail: `${result.report.wordCount}`,
    });
  }
  if (testCase.expect.sourceCount !== undefined) {
    checks.push({
      name: `evidence base has ${testCase.expect.sourceCount} sources`,
      passed: readSources.length === testCase.expect.sourceCount,
      detail: `${readSources.length}`,
    });
  }
  if (testCase.expect.auditVerdict) {
    checks.push({
      name: `audit verdict is ${testCase.expect.auditVerdict}`,
      passed: result.audit.verdict === testCase.expect.auditVerdict,
      detail: result.audit.verdict,
    });
  }
  if (testCase.expect.language === "zh") {
    const cjk = result.report.markdown.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    checks.push({
      name: "report is written in Chinese",
      passed: cjk >= 80,
      detail: `${cjk} CJK characters`,
    });
  }
  if (testCase.expect.requireCounterpoint) {
    checks.push({
      name: "counterevidence section is present",
      passed: /Counterevidence and disagreement|反证与分歧/.test(result.report.markdown),
    });
  }
  if (testCase.expect.requireRevision) {
    const revised = events.some((event) => event.type === "revision.started");
    checks.push({
      name: "exactly one revision was triggered",
      passed:
        revised &&
        events.filter((event) => event.type === "revision.started").length === 1 &&
        result.report.revision === 1,
      detail: `revision ${result.report.revision}`,
    });
  }

  return {
    id: testCase.id,
    name: testCase.name,
    note: testCase.note,
    depth: testCase.depth,
    outcome,
    passed: checks.every((check) => check.passed),
    checks,
    metrics: {
      citations: result.report.citationCount,
      coverage: round(result.audit.citationCoverage, 3),
      auditScore: result.audit.score,
      authority: round(authority, 3),
      domains: domains.length,
      words: result.report.wordCount,
      sourceCount: readSources.length,
      durationMs: result.stats.durationMs,
      tokens: result.stats.usage.totalTokens,
    },
    errorCode: null,
    sources: citedSources.map((source) => toCitedSource(source)),
    events: countEvents(events),
  };
}

function toCitedSource(source: Source): EvalCitedSource {
  return {
    number: source.number ?? 0,
    domain: source.domain,
    tier: domainTier(source.domain),
  };
}

function countEvents(events: HarnessEvent[]) {
  return {
    total: events.length,
    searches: events.filter((event) => event.type === "search.started").length,
    searchFailures: events.filter((event) => event.type === "search.failed").length,
    readFailures: events.filter((event) => event.type === "source.failed").length,
    revisions: events.filter((event) => event.type === "revision.started").length,
  };
}

function summarize(results: EvalCaseResult[]): EvaluationSummary {
  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const successful = results.filter(
    (result): result is EvalCaseResult & { metrics: EvalMetrics } => result.metrics !== null,
  );
  const failures = results.filter((result) => result.outcome === "failure");
  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

  const passRate = total === 0 ? 0 : passed / total;
  const citationCoverage = mean(successful.map((result) => result.metrics.coverage));
  const auditScore = mean(successful.map((result) => result.metrics.auditScore));
  const authorityScore = mean(successful.map((result) => result.metrics.authority));
  const domainDiversity = mean(successful.map((result) => result.metrics.domains));
  const avgLatencyMs = Math.round(mean(successful.map((result) => result.metrics.durationMs)));
  const totalTokens = successful.reduce((sum, result) => sum + result.metrics.tokens, 0);
  const gracefulFailureRate =
    failures.length === 0 ? 1 : failures.filter((result) => result.passed).length / failures.length;

  const tierMix: EvalTierMix = { S: 0, A: 0, B: 0, C: 0 };
  for (const result of successful) {
    for (const source of result.sources) tierMix[source.tier] += 1;
  }

  const composite = round(
    Math.min(
      1,
      passRate * 0.4 +
        citationCoverage * 0.25 +
        (auditScore / 100) * 0.15 +
        authorityScore * 0.1 +
        Math.min(domainDiversity / 5, 1) * 0.1,
    ),
    3,
  );
  const grade =
    composite >= 0.9 && authorityScore >= 0.8 && citationCoverage >= 0.85 && passRate === 1
      ? "S"
      : composite >= 0.8
        ? "A"
        : composite >= 0.7
          ? "B"
          : "C";

  return {
    cases: total,
    passed,
    passRate: round(passRate, 3),
    grade,
    composite,
    citationCoverage: round(citationCoverage, 3),
    auditScore: Math.round(auditScore),
    authorityScore: round(authorityScore, 3),
    domainDiversity: round(domainDiversity, 1),
    gracefulFailureRate: round(gracefulFailureRate, 3),
    avgLatencyMs,
    totalTokens,
    tierMix,
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
