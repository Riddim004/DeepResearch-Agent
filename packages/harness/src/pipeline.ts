import { z } from "zod";

import {
  deterministicAudit,
  LlmAuditSchema,
  mergeAudits,
  parseLlmAudit,
  type LlmAudit,
} from "./audit";
import {
  citationStats,
  extractTitle,
  normalizeReportMarkdown,
  sanitizeCitations,
} from "./citations";
import { buildEvidenceContext, type EvidenceSelection } from "./context";
import {
  buildAuditMessages,
  buildFollowupMessages,
  buildPlanMessages,
  buildReportMessages,
} from "./prompts";
import { completeJson } from "./providers/structured";
import type {
  AuditResult,
  CitationRef,
  Depth,
  DepthProfile,
  HarnessEvent,
  HarnessOptions,
  Phase,
  ReportArtifact,
  ResearchBrief,
  ResearchRequest,
  ResearchResult,
  RunStats,
  SearchResult,
  Source,
  SourceDocument,
  Usage,
} from "./types";
import { mapLimit } from "./util/async";
import { errorMessage, HarnessError, isAbortError, throwIfAborted } from "./util/errors";
import { keywordScore, truncate, wordCount } from "./util/text";
import { isAcademicDomain } from "./util/url";

export const DEPTH_PROFILES: Record<Depth, DepthProfile> = {
  quick: {
    name: "quick",
    label: "Quick scan",
    maxQueries: 3,
    maxResultsPerQuery: 6,
    maxSources: 12,
    maxReads: 6,
    maxRounds: 1,
    searchConcurrency: 3,
    readConcurrency: 4,
    contextTokens: 9_000,
    reportTokens: 2_400,
    timeoutMs: 4 * 60_000,
    revision: false,
  },
  standard: {
    name: "standard",
    label: "Standard brief",
    maxQueries: 5,
    maxResultsPerQuery: 7,
    maxSources: 22,
    maxReads: 10,
    maxRounds: 2,
    searchConcurrency: 3,
    readConcurrency: 4,
    contextTokens: 22_000,
    reportTokens: 4_200,
    timeoutMs: 10 * 60_000,
    revision: true,
  },
  deep: {
    name: "deep",
    label: "Deep dossier",
    maxQueries: 8,
    maxResultsPerQuery: 8,
    maxSources: 36,
    maxReads: 18,
    maxRounds: 3,
    searchConcurrency: 4,
    readConcurrency: 5,
    contextTokens: 42_000,
    reportTokens: 6_500,
    timeoutMs: 20 * 60_000,
    revision: true,
  },
};

const PlanSchema = z.object({
  title: z.string().min(3).max(200),
  restated: z.string().min(10).max(1_000),
  audience: z.string().max(300).catch("An informed generalist"),
  subquestions: z
    .array(
      z.object({
        question: z.string().min(3).max(400),
        why: z.string().max(400).catch(""),
      }),
    )
    .min(1)
    .max(8),
  queries: z
    .array(
      z.object({
        query: z.string().min(2).max(300),
        kind: z.enum(["primary", "evidence", "counterpoint", "recent"]).catch("primary"),
        rationale: z.string().max(300).catch(""),
      }),
    )
    .min(1)
    .max(12),
  successCriteria: z.array(z.string().max(300)).catch([]),
});

const FollowupSchema = z.object({
  gaps: z.array(z.string().max(400)).catch([]),
  queries: z
    .array(
      z.object({
        query: z.string().min(2).max(300),
        rationale: z.string().max(300).catch(""),
      }),
    )
    .catch([]),
});

interface MutableStats {
  searches: number;
  found: number;
  read: number;
  failedReads: number;
  rounds: number;
}

interface RunContext {
  request: ResearchRequest;
  profile: DepthProfile;
  options: HarnessOptions;
  emit: (event: HarnessEvent) => void;
  log: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ) => void;
  addUsage: (usage: Usage) => void;
  stats: MutableStats;
  sources: Source[];
  documents: SourceDocument[];
  queryHistory: string[];
  seenUrls: Set<string>;
  searchErrors: string[];
  sourceCounter: number;
  domainCounts: Map<string, number>;
  startedAt: number;
}

const PHASES: Array<{ phase: Phase; label: string }> = [
  { phase: "scope", label: "Scoping the question" },
  { phase: "discover", label: "Searching the web" },
  { phase: "read", label: "Reading sources" },
  { phase: "write", label: "Writing the brief" },
  { phase: "audit", label: "Auditing citations" },
];

export async function runResearch(
  request: ResearchRequest,
  options: HarnessOptions,
): Promise<ResearchResult> {
  const normalized = validateRequest(request);
  const profile = DEPTH_PROFILES[normalized.depth ?? "standard"];
  const now = options.now ?? Date.now;
  const startedAt = now();
  const totalUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const stats: MutableStats = {
    searches: 0,
    found: 0,
    read: 0,
    failedReads: 0,
    rounds: 0,
  };

  const log = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ) => {
    options.logger?.[level](message, data);
    if (level === "warn" || level === "error") {
      emit({ type: "log", level, message });
    }
  };

  const emit = (event: HarnessEvent) => {
    try {
      options.onEvent(event);
    } catch (error) {
      options.logger?.warn("Event sink threw", { error: errorMessage(error) });
    }
  };

  const context: RunContext = {
    request: normalized,
    profile,
    options,
    emit,
    log,
    addUsage(usage) {
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.totalTokens += usage.totalTokens;
    },
    stats,
    sources: [],
    documents: [],
    queryHistory: [],
    seenUrls: new Set(),
    searchErrors: [],
    sourceCounter: 0,
    domainCounts: new Map(),
    startedAt,
  };

  emit({
    type: "run.started",
    query: normalized.query,
    depth: profile.name,
    model: options.provider.model,
    demo: options.demo ?? Boolean(options.provider.demo),
  });

  try {
    throwIfAborted(options.signal);
    const brief = await runPhase(context, "scope", () => createBrief(context));
    throwIfAborted(options.signal);
    await runPhase(context, "discover", () => discover(context, brief));
    throwIfAborted(options.signal);
    await runPhase(context, "read", () => readSources(context));
    throwIfAborted(options.signal);
    if (context.documents.length === 0) {
      throw new HarnessError(
        "NO_SOURCES",
        context.searchErrors.length > 0
          ? `No sources could be read. Search said: ${context.searchErrors[0]}`
          : "No readable sources were found. Try a more specific query or a different search provider.",
      );
    }

    const evidence = buildEvidenceContext(context.documents, brief, profile.contextTokens);
    applyCitations(context, evidence);
    emit({
      type: "context.built",
      citations: evidence.citations,
      tokens: evidence.tokens,
      sources: evidence.sources.length,
    });

    const initialReport = await runPhase(context, "write", () =>
      writeReport(context, brief, evidence, 0),
    );
    throwIfAborted(options.signal);

    const reviewed = await runPhase(context, "audit", async () => {
      let report = initialReport;
      let audit = await auditReport(context, brief, evidence, report, 0);
      throwIfAborted(options.signal);

      if (audit.verdict === "revise" && profile.revision) {
        const feedback = formatAuditFeedback(audit);
        emit({ type: "revision.started", reason: feedback });
        report = await writeReport(context, brief, evidence, 1, feedback);
        throwIfAborted(options.signal);
        const cited = citedDocuments(context, evidence, report);
        const deterministic = deterministicAudit(report.markdown, cited, brief);
        audit = {
          ...deterministic,
          notes: `Post-revision deterministic audit. ${deterministic.notes}`,
          verdict:
            deterministic.verdict === "pass" && deterministic.citationCoverage >= 0.45
              ? "pass"
              : "revise",
        };
        emit({ type: "audit.completed", audit });
      }
      return { report, audit };
    });
    const report = reviewed.report;
    const audit = reviewed.audit;

    const finalCitations = finalizeCitations(context, evidence, report);
    const citedSources = citationSources(context, finalCitations);
    const finishedAt = now();
    const estimatedCostUsd = options.pricing
      ? Number(
          (
            (totalUsage.inputTokens / 1_000_000) * options.pricing.inputUsdPerM +
            (totalUsage.outputTokens / 1_000_000) * options.pricing.outputUsdPerM
          ).toFixed(4),
        )
      : null;

    const runStats: RunStats = {
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      searches: stats.searches,
      found: stats.found,
      read: stats.read,
      failedReads: stats.failedReads,
      rounds: stats.rounds,
      usage: { ...totalUsage },
      estimatedCostUsd,
      model: options.provider.model,
      provider: options.provider.id,
    };

    return {
      brief,
      report,
      sources: sortSources(context.sources),
      citations: finalCitations,
      audit,
      stats: runStats,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof HarnessError) throw error;
    throw new HarnessError("INTERNAL", errorMessage(error), { cause: error });
  }
}

async function runPhase<T>(context: RunContext, phase: Phase, task: () => Promise<T>): Promise<T> {
  const index = PHASES.findIndex((item) => item.phase === phase);
  const meta = PHASES[index] ?? { phase, label: phase };
  const started = (context.options.now ?? Date.now)();
  context.emit({
    type: "phase.started",
    phase,
    label: meta.label,
    index: index + 1,
    total: PHASES.length,
  });
  try {
    return await task();
  } finally {
    context.emit({
      type: "phase.completed",
      phase,
      durationMs: (context.options.now ?? Date.now)() - started,
    });
  }
}

function validateRequest(request: ResearchRequest): ResearchRequest {
  const query = request.query?.trim();
  if (!query || query.length < 3) {
    throw new HarnessError(
      "INVALID_INPUT",
      "Enter a research question with at least 3 characters.",
    );
  }
  if (query.length > 4_000) {
    throw new HarnessError("INVALID_INPUT", "Keep the research question under 4,000 characters.");
  }
  const depth = request.depth && request.depth in DEPTH_PROFILES ? request.depth : "standard";
  const recency =
    request.recencyDays && Number.isFinite(request.recencyDays)
      ? Math.min(3_650, Math.max(1, Math.round(request.recencyDays)))
      : undefined;
  return {
    query,
    depth,
    language: request.language?.trim().slice(0, 20) || "auto",
    audience: request.audience?.trim().slice(0, 240) || undefined,
    ...(recency ? { recencyDays: recency } : {}),
  };
}

async function createBrief(context: RunContext): Promise<ResearchBrief> {
  const today = new Date(context.startedAt).toISOString().slice(0, 10);
  const messages = buildPlanMessages(context.request, context.profile, today);

  try {
    const { value, usage } = await completeJson(
      context.options.provider,
      {
        task: "plan",
        messages,
        temperature: 0.2,
        maxTokens: 1_600,
        signal: context.options.signal,
        metadata: {
          query: context.request.query,
          depth: context.profile.name,
          language: context.request.language,
          maxQueries: context.profile.maxQueries,
        },
      },
      (input) => PlanSchema.parse(input),
    );
    context.addUsage(usage);
    const brief = normalizeBrief(value, context);
    context.emit({ type: "plan.created", brief });
    return brief;
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (
      error instanceof HarnessError &&
      (error.code === "PROVIDER_AUTH" || error.code === "PROVIDER_RATE_LIMIT")
    ) {
      throw error;
    }
    context.log("warn", "Planning failed; using a heuristic brief.", {
      error: errorMessage(error),
    });
    const brief = fallbackBrief(context);
    context.emit({ type: "plan.created", brief });
    return brief;
  }
}

function normalizeBrief(parsed: z.infer<typeof PlanSchema>, context: RunContext): ResearchBrief {
  const seen = new Set<string>();
  const queries = parsed.queries
    .map((item) => ({
      query: cleanQuery(item.query),
      kind: item.kind,
      rationale: item.rationale.trim(),
    }))
    .filter((item) => {
      const key = item.query.toLowerCase();
      if (!item.query || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const original = cleanQuery(context.request.query);
  if (original && !seen.has(original.toLowerCase())) {
    queries.unshift({
      query: original,
      kind: "primary",
      rationale: "The original research question",
    });
  }

  if (
    !queries.some((item) => item.kind === "counterpoint") &&
    queries.length < context.profile.maxQueries
  ) {
    queries.push({
      query: `${truncate(original.replace(/[?？.。]+$/, ""), 80)} criticism limitations`,
      kind: "counterpoint",
      rationale: "Deliberately surface credible disagreement",
    });
  }

  return {
    title: cleanTitle(parsed.title) || truncate(original, 80),
    restated: parsed.restated.trim(),
    audience: parsed.audience.trim() || "An informed generalist",
    subquestions: parsed.subquestions
      .map((item) => ({ question: item.question.trim(), why: item.why.trim() }))
      .filter((item) => item.question)
      .slice(0, 5),
    queries: queries.slice(0, context.profile.maxQueries),
    successCriteria:
      parsed.successCriteria.length > 0
        ? parsed.successCriteria
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 6)
        : [
            "Every factual claim is traceable to a cited source",
            "Counterevidence is presented, not buried",
            "Uncertainty is explicit",
          ],
  };
}

function fallbackBrief(context: RunContext): ResearchBrief {
  const query = context.request.query;
  const base = truncate(query.replace(/[?？.。]+$/, ""), 80);
  const queries = [
    { query, kind: "primary" as const, rationale: "The original question" },
    { query: `${base} evidence data`, kind: "evidence" as const, rationale: "Primary evidence" },
    {
      query: `${base} criticism limitations`,
      kind: "counterpoint" as const,
      rationale: "Credible disagreement",
    },
    { query: `${base} 2026`, kind: "recent" as const, rationale: "Recent developments" },
  ].slice(0, context.profile.maxQueries);

  return {
    title: truncate(base, 80),
    restated: `This brief examines ${query}`,
    audience: context.request.audience ?? "An informed generalist",
    subquestions: [
      { question: `What is the current state of ${base}?`, why: "Establish the factual baseline" },
      {
        question: "What evidence supports the main claims?",
        why: "Test the claims against evidence",
      },
      { question: "What counterevidence or limits exist?", why: "Avoid a one-sided answer" },
    ],
    queries,
    successCriteria: [
      "Every factual claim is cited",
      "Counterevidence is included",
      "Limitations are explicit",
    ],
  };
}

async function discover(context: RunContext, brief: ResearchBrief): Promise<void> {
  let queries = brief.queries.map((item) => item.query);
  const maxRounds = context.profile.maxRounds;

  for (let round = 1; round <= maxRounds; round += 1) {
    throwIfAborted(context.options.signal);
    context.stats.rounds = round;
    const unique = queries.filter(
      (query, index) =>
        !context.queryHistory.some((used) => used.toLowerCase() === query.toLowerCase()) &&
        queries.findIndex((candidate) => candidate.toLowerCase() === query.toLowerCase()) === index,
    );
    if (unique.length === 0) break;
    context.queryHistory.push(...unique);

    await mapLimit(unique, context.profile.searchConcurrency, (query) =>
      runSearch(context, brief, query, round),
    );

    if (context.sources.length >= context.profile.maxSources) break;
    if (round >= maxRounds) break;

    const assessment = await assessCoverage(context, brief, round);
    context.emit({
      type: "coverage.assessed",
      round,
      gaps: assessment.gaps,
      followUpQueries: assessment.queries,
    });
    if (assessment.queries.length === 0) break;
    queries = assessment.queries;
  }

  if (context.sources.length === 0) {
    throw new HarnessError(
      "NO_SOURCES",
      context.searchErrors.length > 0
        ? `Every search failed. ${context.searchErrors[0]}`
        : "The search provider returned no sources. Try a different query or configure a search API key.",
    );
  }
}

async function runSearch(
  context: RunContext,
  brief: ResearchBrief,
  query: string,
  round: number,
): Promise<void> {
  const started = (context.options.now ?? Date.now)();
  context.stats.searches += 1;
  context.emit({
    type: "search.started",
    query,
    round,
    provider: context.options.search.id,
  });

  try {
    const results = await context.options.search.search(query, {
      maxResults: context.profile.maxResultsPerQuery,
      ...(context.request.recencyDays ? { recencyDays: context.request.recencyDays } : {}),
      ...(context.options.signal ? { signal: context.options.signal } : {}),
    });
    throwIfAborted(context.options.signal);
    const added = addResults(context, brief, results);
    context.emit({
      type: "search.completed",
      query,
      count: results.length,
      newCount: added,
      durationMs: (context.options.now ?? Date.now)() - started,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    const message = errorMessage(error);
    context.searchErrors.push(message);
    context.emit({ type: "search.failed", query, error: message });
    context.log("warn", "Search failed", { query, error: message });
  }
}

function addResults(context: RunContext, brief: ResearchBrief, results: SearchResult[]): number {
  const maxPerDomain = context.profile.name === "quick" ? 2 : 3;
  let added = 0;

  for (const result of results) {
    if (context.sources.length >= context.profile.maxSources) break;
    const normalized = result.url;
    if (!normalized || context.seenUrls.has(normalized)) continue;
    const domain = safeDomain(normalized);
    if (!domain) continue;
    const domainCount = context.domainCounts.get(domain) ?? 0;
    if (domainCount >= maxPerDomain) continue;

    const score = scoreResult(result, brief, domain);
    const source: Source = {
      id: `s${++context.sourceCounter}`,
      number: null,
      title: result.title || domain,
      url: normalized,
      domain,
      snippet: result.snippet,
      provider: result.provider,
      score,
      status: "found",
      ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
    };

    context.seenUrls.add(normalized);
    context.domainCounts.set(domain, domainCount + 1);
    context.sources.push(source);
    context.stats.found += 1;
    added += 1;
    context.emit({ type: "source.found", source: { ...source } });
  }

  return added;
}

function scoreResult(result: SearchResult, brief: ResearchBrief, domain: string): number {
  const focus = [brief.restated, ...brief.subquestions.map((item) => item.question)].join("\n");
  const relevance = keywordScore(focus, `${result.title} ${result.snippet}`);
  const rankScore = Math.max(0, 1 - (result.rank - 1) / 12) * 0.2;
  const trust = isAcademicDomain(domain)
    ? 0.14
    : /(reuters|apnews|bbc|ft\.com|nytimes|wsj|economist|bloomberg)\./.test(domain)
      ? 0.1
      : 0.03;
  const freshness = result.publishedAt ? freshnessScore(result.publishedAt) : 0;
  return Math.max(0, Math.min(1, relevance * 0.58 + rankScore + trust + freshness));
}

function freshnessScore(publishedAt: string): number {
  const parsed = Date.parse(publishedAt);
  if (Number.isNaN(parsed)) return 0;
  const days = (Date.now() - parsed) / 86_400_000;
  if (days < 0) return 0.06;
  if (days <= 90) return 0.1;
  if (days <= 365) return 0.05;
  return 0;
}

async function assessCoverage(
  context: RunContext,
  brief: ResearchBrief,
  round: number,
): Promise<{ gaps: string[]; queries: string[] }> {
  const heuristic = () => heuristicFollowup(context, round);
  if (context.sources.length < 3) return heuristic();

  const today = new Date(context.startedAt).toISOString().slice(0, 10);
  try {
    const { value, usage } = await completeJson(
      context.options.provider,
      {
        task: "followup",
        messages: buildFollowupMessages(
          brief,
          round,
          sortSources(context.sources).slice(0, 24),
          context.queryHistory,
          today,
        ),
        temperature: 0.2,
        maxTokens: 700,
        signal: context.options.signal,
        metadata: {
          query: context.request.query,
          round,
          language: context.request.language,
        },
      },
      (input) => FollowupSchema.parse(input),
    );
    context.addUsage(usage);
    const queries = value.queries
      .map((item) => cleanQuery(item.query))
      .filter(
        (query) =>
          query && !context.queryHistory.some((used) => used.toLowerCase() === query.toLowerCase()),
      )
      .slice(0, 2);
    return {
      gaps: value.gaps
        .map((gap) => gap.trim())
        .filter(Boolean)
        .slice(0, 3),
      queries,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    context.log("warn", "Coverage assessment failed; using a heuristic follow-up.", {
      error: errorMessage(error),
    });
    return heuristic();
  }
}

function heuristicFollowup(
  context: RunContext,
  round: number,
): { gaps: string[]; queries: string[] } {
  if (context.sources.length >= 10 || round >= 2) return { gaps: [], queries: [] };
  const base = truncate(context.request.query.replace(/[?？.。]+$/, ""), 80);
  const candidates = [
    `${base} evidence data`,
    `${base} independent evaluation`,
    `${base} case study`,
  ];
  const queries = candidates
    .filter(
      (query) => !context.queryHistory.some((used) => used.toLowerCase() === query.toLowerCase()),
    )
    .slice(0, 2);
  return {
    gaps:
      queries.length > 0 ? ["The evidence base is still thin and needs independent material."] : [],
    queries,
  };
}

async function readSources(context: RunContext): Promise<void> {
  const candidates = sortSources(context.sources)
    .filter((source) => source.status === "found")
    .slice(0, context.profile.maxReads);

  await mapLimit(candidates, context.profile.readConcurrency, async (source) => {
    throwIfAborted(context.options.signal);
    source.status = "reading";
    context.emit({ type: "source.reading", sourceId: source.id, title: source.title });

    try {
      const page = await context.options.fetcher.fetch(source.url, {
        ...(context.options.signal ? { signal: context.options.signal } : {}),
      });
      throwIfAborted(context.options.signal);
      source.status = "read";
      source.title = page.title || source.title;
      source.excerpt = page.excerpt || truncate(page.text, 420);
      source.wordCount = page.wordCount;
      source.accessedAt = new Date().toISOString();
      if (page.publishedAt) source.publishedAt = page.publishedAt;
      context.stats.read += 1;
      context.documents.push({ source, text: page.text });
      context.emit({ type: "source.read", source: { ...source } });
    } catch (error) {
      if (isAbortError(error)) throw error;
      source.status = "failed";
      source.error = errorMessage(error);
      context.stats.failedReads += 1;
      context.emit({
        type: "source.failed",
        sourceId: source.id,
        title: source.title,
        error: source.error,
      });
    }
  });
}

function applyCitations(context: RunContext, evidence: EvidenceSelection): void {
  const byId = new Map(context.sources.map((source) => [source.id, source]));
  for (const citation of evidence.citations) {
    const source = byId.get(citation.sourceId);
    if (source) source.number = citation.number;
  }
}

function mockSources(evidence: EvidenceSelection): Array<{
  number: number;
  title: string;
  domain: string;
  url: string;
  excerpt: string;
}> {
  return evidence.citations.map((citation) => {
    const document = evidence.sources.find((item) => item.source.id === citation.sourceId);
    return {
      number: citation.number,
      title: document?.source.title ?? "",
      domain: document?.source.domain ?? "",
      url: document?.source.url ?? "",
      excerpt: truncate(document?.text ?? "", 2_400),
    };
  });
}

async function writeReport(
  context: RunContext,
  brief: ResearchBrief,
  evidence: EvidenceSelection,
  revision: number,
  feedback?: string,
): Promise<ReportArtifact> {
  context.emit({ type: "report.started", revision });
  const today = new Date(context.startedAt).toISOString().slice(0, 10);
  const messages = buildReportMessages({
    request: context.request,
    brief,
    profile: context.profile,
    evidence: evidence.text,
    revision,
    ...(feedback ? { auditFeedback: feedback } : {}),
    today,
  });

  let raw = "";
  let usage: Usage | null = null;
  for await (const event of context.options.provider.stream({
    task: revision > 0 ? "revise" : "report",
    messages,
    temperature: revision > 0 ? 0.25 : 0.35,
    maxTokens: context.profile.reportTokens,
    signal: context.options.signal,
    metadata: {
      query: context.request.query,
      depth: context.profile.name,
      language: context.request.language,
      brief,
      sources: mockSources(evidence),
      revision,
    },
  })) {
    if (event.type === "text") {
      raw += event.text;
      context.emit({ type: "report.delta", text: event.text });
    }
    if (event.type === "usage") usage = event.usage;
  }
  if (usage) context.addUsage(usage);
  throwIfAborted(context.options.signal);

  if (!raw.trim()) {
    throw new HarnessError("PROVIDER_ERROR", "The model returned an empty report.");
  }

  const validNumbers = new Set(evidence.citations.map((citation) => citation.number));
  const sanitized = sanitizeCitations(raw, validNumbers);
  if (sanitized.removed.length > 0) {
    context.log("warn", "Removed citations that pointed to no available source.", {
      removed: Array.from(new Set(sanitized.removed)),
    });
  }

  const markdown = normalizeReportMarkdown(sanitized.text, brief.title);
  const report: ReportArtifact = {
    title: extractTitle(markdown) ?? brief.title,
    markdown,
    wordCount: wordCount(markdown),
    citationCount: citationStats(markdown).citationCount,
    revision,
  };
  context.emit({ type: "report.completed", report });
  return report;
}

async function auditReport(
  context: RunContext,
  brief: ResearchBrief,
  evidence: EvidenceSelection,
  report: ReportArtifact,
  revision: number,
): Promise<AuditResult> {
  context.emit({ type: "audit.started" });
  const citedSources = citedDocuments(context, evidence, report);
  const deterministic = deterministicAudit(report.markdown, citedSources, brief);

  let llm: LlmAudit | null = null;
  if (context.profile.name !== "quick" && report.markdown.length > 0) {
    try {
      const { value, usage } = await completeJson(
        context.options.provider,
        {
          task: "audit",
          messages: buildAuditMessages({
            brief,
            report: report.markdown,
            evidence: evidence.text,
            sourceCount: citedSources.length,
            citationCoverage: deterministic.citationCoverage,
          }),
          temperature: 0.1,
          maxTokens: 1_400,
          signal: context.options.signal,
          metadata: {
            query: context.request.query,
            report: report.markdown,
            brief,
            sources: mockSources(evidence),
            revision,
            language: context.request.language,
          },
        },
        (input) => LlmAuditSchema.parse(input),
      );
      context.addUsage(usage);
      llm = parseLlmAudit(value);
    } catch (error) {
      if (isAbortError(error)) throw error;
      context.log("warn", "Auditor failed; using deterministic citation checks.", {
        error: errorMessage(error),
      });
    }
  }

  const audit = mergeAudits(deterministic, llm);
  context.emit({ type: "audit.completed", audit });
  return audit;
}

function citedDocuments(
  context: RunContext,
  evidence: EvidenceSelection,
  report: ReportArtifact,
): Source[] {
  const numbers = new Set(citationStats(report.markdown).numbers);
  const byId = new Map(context.sources.map((source) => [source.id, source]));
  const cited: Source[] = [];
  for (const citation of evidence.citations) {
    if (!numbers.has(citation.number)) continue;
    const source = byId.get(citation.sourceId);
    if (source) cited.push(source);
  }
  return cited;
}

function finalizeCitations(
  context: RunContext,
  evidence: EvidenceSelection,
  report: ReportArtifact,
): CitationRef[] {
  const numbers = new Set(citationStats(report.markdown).numbers);
  const cited = evidence.citations.filter((citation) => numbers.has(citation.number));
  const citedIds = new Set(cited.map((citation) => citation.sourceId));
  for (const source of context.sources) {
    if (!citedIds.has(source.id)) source.number = null;
  }
  return cited;
}

function citationSources(context: RunContext, citations: CitationRef[]): Source[] {
  const byId = new Map(context.sources.map((source) => [source.id, source]));
  return citations
    .map((citation) => byId.get(citation.sourceId))
    .filter((source): source is Source => Boolean(source));
}

function sortSources(sources: Source[]): Source[] {
  const statusRank: Record<Source["status"], number> = {
    read: 0,
    reading: 0,
    found: 1,
    failed: 2,
    skipped: 3,
  };
  return [...sources].sort((a, b) => {
    if (a.number !== null && b.number === null) return -1;
    if (a.number === null && b.number !== null) return 1;
    if (a.number !== null && b.number !== null) return a.number - b.number;
    const rank = statusRank[a.status] - statusRank[b.status];
    if (rank !== 0) return rank;
    return b.score - a.score;
  });
}

function formatAuditFeedback(audit: AuditResult): string {
  const issues = audit.issues
    .slice(0, 5)
    .map(
      (issue, index) =>
        `${index + 1}. [${issue.severity}] ${issue.claim} — ${issue.problem} Fix: ${issue.suggestion}`,
    );
  const angles =
    audit.missingAngles.length > 0 ? `\nMissing angles: ${audit.missingAngles.join("; ")}` : "";
  return `${issues.join("\n")}${angles}`.slice(0, 2_400);
}

function cleanQuery(query: string): string {
  return query
    .replace(/^[\s\-*•\d.)、]+/, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function cleanTitle(title: string): string {
  return title
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
