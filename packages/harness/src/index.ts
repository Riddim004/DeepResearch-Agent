export * from "./types";
export { runResearch, DEPTH_PROFILES } from "./pipeline";
export {
  createRuntimeFromEnv,
  type DossierRuntime,
  type RuntimeEnv,
  type RuntimeOptions,
} from "./runtime";

export {
  appendSourceLedger,
  citationStats,
  extractTitle,
  linkifyCitations,
  normalizeReportMarkdown,
  sanitizeCitations,
} from "./citations";
export { buildEvidenceContext, type EvidenceSelection } from "./context";
export {
  deterministicAudit,
  LlmAuditSchema,
  mergeAudits,
  parseLlmAudit,
  type LlmAudit,
} from "./audit";

export { MockProvider, type MockProviderOptions } from "./providers/mock";
export { OpenAICompatibleProvider, type OpenAIProviderOptions } from "./providers/openai";
export { iterateSse } from "./providers/sse";
export { completeJson, completeText, type CompletionResult } from "./providers/structured";

export { PageReader, type PageReaderOptions } from "./reader/reader";
export { assertSafeUrl, isPrivateIp } from "./reader/safe-url";

export { DuckDuckGoProvider, parseDuckDuckGoHtml, parseDuckDuckGoLite } from "./search/duckduckgo";
export { WikipediaProvider } from "./search/wikipedia";
export { BingNewsProvider } from "./search/bing-news";
export { ArxivProvider } from "./search/arxiv";
export { MergedSearchProvider } from "./search/merged";
export { TavilyProvider } from "./search/tavily";
export { BraveProvider } from "./search/brave";
export { SerperProvider } from "./search/serper";
export { ExaProvider } from "./search/exa";
export { MultiSearchProvider } from "./search/multi";
export { SearchProviderError } from "./search/errors";

export { HarnessError, errorMessage, isAbortError, isTimeoutError } from "./util/errors";
export { estimateTokens, wordCount } from "./util/text";
export { consoleLogger, silentLogger } from "./util/logger";
export { extractJson } from "./util/json";
export { FixturePageFetcher, FixtureSearchProvider, FIXTURE_QUERY } from "./testing/fixtures";
