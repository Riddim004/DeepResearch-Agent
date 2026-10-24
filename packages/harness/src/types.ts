export type Depth = "quick" | "standard" | "deep";

export type Phase = "scope" | "discover" | "read" | "write" | "audit";

export type QueryKind = "primary" | "evidence" | "counterpoint" | "recent";

export interface ResearchRequest {
  query: string;
  depth?: Depth;
  language?: string;
  audience?: string;
  recencyDays?: number;
}

export interface DepthProfile {
  readonly name: Depth;
  readonly label: string;
  readonly maxQueries: number;
  readonly maxResultsPerQuery: number;
  readonly maxSources: number;
  readonly maxReads: number;
  readonly maxRounds: number;
  readonly searchConcurrency: number;
  readonly readConcurrency: number;
  readonly contextTokens: number;
  readonly reportTokens: number;
  readonly timeoutMs: number;
  readonly revision: boolean;
}

export interface ResearchBrief {
  title: string;
  restated: string;
  audience: string;
  subquestions: Array<{ question: string; why: string }>;
  queries: Array<{ query: string; kind: QueryKind; rationale: string }>;
  successCriteria: string[];
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  provider: string;
  rank: number;
  publishedAt?: string;
}

export interface SearchOptions {
  maxResults: number;
  recencyDays?: number;
  signal?: AbortSignal;
}

export interface SearchProvider {
  readonly id: string;
  readonly label: string;
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}

export type SourceStatus = "found" | "reading" | "read" | "failed" | "skipped";

export interface Source {
  id: string;
  number: number | null;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  provider: string;
  publishedAt?: string;
  score: number;
  status: SourceStatus;
  wordCount?: number;
  excerpt?: string;
  error?: string;
  accessedAt?: string;
}

export interface SourceDocument {
  source: Source;
  text: string;
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  excerpt: string;
  byline?: string;
  siteName?: string;
  language?: string;
  publishedAt?: string;
  wordCount: number;
}

export interface PageFetcher {
  fetch(url: string, options?: { signal?: AbortSignal }): Promise<FetchedPage>;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type TaskKind = "plan" | "followup" | "report" | "revise" | "audit";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  task: TaskKind;
  messages: ChatMessage[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export type ModelStreamEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done"; finishReason?: string };

export interface ModelProvider {
  readonly id: string;
  readonly model: string;
  readonly demo?: boolean;
  stream(request: CompletionRequest): AsyncIterable<ModelStreamEvent>;
}

export interface CitationRef {
  number: number;
  sourceId: string;
}

export interface ReportArtifact {
  title: string;
  markdown: string;
  wordCount: number;
  citationCount: number;
  revision: number;
}

export interface AuditIssue {
  severity: "low" | "medium" | "high";
  claim: string;
  problem: string;
  suggestion: string;
}

export interface AuditResult {
  score: number;
  citationCoverage: number;
  sourceCount: number;
  issues: AuditIssue[];
  missingAngles: string[];
  verdict: "pass" | "revise";
  notes: string;
}

export interface RunStats {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  searches: number;
  found: number;
  read: number;
  failedReads: number;
  rounds: number;
  usage: Usage;
  estimatedCostUsd: number | null;
  model: string;
  provider: string;
}

export interface ResearchResult {
  brief: ResearchBrief;
  report: ReportArtifact;
  sources: Source[];
  citations: CitationRef[];
  audit: AuditResult;
  stats: RunStats;
}

export type HarnessLogLevel = "debug" | "info" | "warn" | "error";

export interface HarnessLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export type HarnessEvent =
  | { type: "run.started"; query: string; depth: Depth; model: string; demo: boolean }
  | { type: "phase.started"; phase: Phase; label: string; index: number; total: number }
  | { type: "phase.completed"; phase: Phase; durationMs: number }
  | { type: "plan.created"; brief: ResearchBrief }
  | { type: "search.started"; query: string; round: number; provider: string }
  | {
      type: "search.completed";
      query: string;
      count: number;
      newCount: number;
      durationMs: number;
    }
  | { type: "search.failed"; query: string; error: string }
  | { type: "source.found"; source: Source }
  | { type: "source.reading"; sourceId: string; title: string }
  | { type: "source.read"; source: Source }
  | { type: "source.failed"; sourceId: string; title: string; error: string }
  | { type: "coverage.assessed"; round: number; gaps: string[]; followUpQueries: string[] }
  | { type: "context.built"; citations: CitationRef[]; tokens: number; sources: number }
  | { type: "report.started"; revision: number }
  | { type: "report.delta"; text: string }
  | { type: "report.snapshot"; text: string }
  | { type: "report.completed"; report: ReportArtifact }
  | { type: "audit.started" }
  | { type: "audit.completed"; audit: AuditResult }
  | { type: "revision.started"; reason: string }
  | { type: "run.completed"; stats: RunStats; title: string }
  | { type: "run.failed"; error: string; code: string }
  | { type: "run.cancelled" }
  | { type: "log"; level: HarnessLogLevel; message: string };

export type HarnessErrorCode =
  | "INVALID_INPUT"
  | "PROVIDER_AUTH"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_ERROR"
  | "SEARCH_FAILED"
  | "NO_SOURCES"
  | "TIMEOUT"
  | "CANCELLED"
  | "INTERNAL";

export interface HarnessOptions {
  provider: ModelProvider;
  search: SearchProvider;
  fetcher: PageFetcher;
  logger?: HarnessLogger;
  demo?: boolean;
  pricing?: { inputUsdPerM: number; outputUsdPerM: number } | null;
  onEvent: (event: HarnessEvent) => void;
  signal?: AbortSignal;
  now?: () => number;
}

export interface StoredEvent<T = HarnessEvent> {
  seq: number;
  ts: number;
  type: T extends { type: infer K } ? K : string;
  data: T;
}

export interface Pricing {
  inputUsdPerM: number;
  outputUsdPerM: number;
}
